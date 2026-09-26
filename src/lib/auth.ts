import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { adminAuth, isAdminConfigured } from "@/lib/firebase/admin";
import { accountState, forgetAccountState, type AccountState } from "@/lib/account-state";
import { NextResponse } from "next/server";
import { isExpectedAuthError, logError } from "@/lib/log";
import { REAUTH_MAX_AGE_S, REAUTH_REQUIRED } from "@/lib/reauth-shared";

export const SESSION_COOKIE = "sextant_session";
/** Durée de la session : 14 jours (maximum autorisé par Firebase). */
export const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  uid: string;
  email: string | null;
  name: string | null;
  picture: string | null;
  /** Date de la dernière connexion Google (claim `auth_time`, en secondes) : sert à exiger une connexion récente. */
  authTime: number;
}

/**
 * Connexion Google récente (moins de `maxAgeSec`, 10 minutes par défaut) ? Exigée avant les opérations qu'un cookie
 * volé ne doit pas suffire à faire : supprimer le compte, créer une clé MCP (SEC-09). Sinon la route répond
 * `reauthRequired()` et le client relance la fenêtre Google (components/auth/reauth.ts).
 */
export function isRecentLogin(user: Pick<SessionUser, "authTime">, maxAgeSec = REAUTH_MAX_AGE_S, now = Date.now()): boolean {
  return Number.isFinite(user.authTime) && now / 1000 - user.authTime <= maxAgeSec;
}

/** Réponse d'une opération sensible sur une session trop ancienne : le client sait qu'il doit refaire la connexion Google. */
export function reauthRequired(): NextResponse {
  return NextResponse.json({ error: "Pour confirmer, reconnectez-vous avec Google.", code: REAUTH_REQUIRED }, { status: 401, headers: { "cache-control": "private, no-store" } });
}

/** Les comptes sont actifs si le client et le serveur sont configurés. */
export function isAuthEnabled(): boolean {
  return (
    isAdminConfigured() &&
    Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID && process.env.NEXT_PUBLIC_FIREBASE_APP_ID)
  );
}

/**
 * Oublie l'état du compte mémorisé sur cette instance (après une révocation ou la suppression du compte) : les
 * cookies des autres appareils sont recontrôlés dès leur prochaine requête sur cette instance.
 */
export function forgetRevocationCheck(uid: string): void {
  forgetAccountState(uid);
}

async function readSession(strict: boolean): Promise<SessionUser | null> {
  if (!isAuthEnabled()) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const auth = await adminAuth();
    // Vérification locale (signature, expiration) : aucun appel réseau une fois les clés publiques en cache.
    const claims = await auth.verifySessionCookie(token);
    const authTime = typeof claims.auth_time === "number" ? claims.auth_time : 0;
    // Contrôle de révocation, identique à verifySessionCookie(token, true) mais avec l'état du compte mémorisé
    // 5 minutes par uid (lib/account-state.ts) : compte supprimé ou désactivé, ou cookie antérieur à la dernière
    // révocation des jetons (SEC-08). La comparaison se fait à chaque requête avec l'auth_time de CE cookie : une
    // nouvelle connexion après la révocation ne blanchit pas un cookie volé plus ancien du même uid.
    let account: AccountState | null;
    try {
      account = await accountState(claims.uid);
    } catch (e) {
      // Firebase Auth injoignable : les écritures échouent fermé ; les lectures restent servies (comportement
      // antérieur au contrôle), avec une trace.
      if (strict) throw e;
      logError("auth.accountState", e);
      account = null;
    }
    if (account && (!account.active || authTime * 1000 < account.validAfter)) return null;
    return {
      uid: claims.uid,
      email: claims.email ?? null,
      name: (claims.name as string | undefined) ?? null,
      picture: (claims.picture as string | undefined) ?? null,
      authTime,
    };
  } catch (e) {
    // On échoue fermé (déconnecté), mais une panne du SDK Admin ou du réseau doit laisser une trace.
    if (!isExpectedAuthError(e)) logError("auth.session", e);
    return null;
  }
}

/**
 * Utilisateur courant d'après le cookie de session, ou null, pour les rendus et les lectures. Mémorisé pour la
 * durée de la requête. Contrôle aussi la révocation (compte supprimé ou désactivé, « Se déconnecter de tous les
 * appareils ») avec un délai de 5 minutes au plus (état du compte mémorisé par instance) : un cookie copié ne permet
 * plus de lire la bibliothèque ensuite (SEC-08). Si Firebase Auth ne répond pas, la lecture reste servie. Une lecture
 * ne doit jamais écrire sous `users/{uid}` quand le profil n'existe pas (cf. `listFavoriteIds`) : elle recréerait un
 * document orphelin pour un compte supprimé. Les écritures passent par `getCurrentUserStrict`.
 */
export const getCurrentUser = cache((): Promise<SessionUser | null> => readSession(false));

/**
 * Variante stricte, pour les écritures et les opérations sensibles (export, clés d'API, partage, suppression) : même
 * contrôle, mais échec fermé si Firebase Auth ne répond pas. Sans quoi un cookie resté sur un autre appareil pourrait
 * recréer des données sous users/{uid} après la suppression du compte.
 */
export const getCurrentUserStrict = cache((): Promise<SessionUser | null> => readSession(true));
