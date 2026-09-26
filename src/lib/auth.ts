import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { adminAuth, isAdminConfigured } from "@/lib/firebase/admin";
import { accountState, forgetAccountState, type AccountState } from "@/lib/account-state";
import { NextResponse } from "next/server";
import { isExpectedAuthError, logError } from "@/lib/log";
import { REAUTH_MAX_AGE_S, REAUTH_REQUIRED } from "@/lib/reauth-shared";

import { SESSION_COOKIE } from "@/lib/session-shared";

// Noms et durée des cookies de session : module partagé avec le proxy et le navigateur (indice de connexion, PERF-01).
export { SESSION_COOKIE, SESSION_MAX_AGE_MS } from "@/lib/session-shared";

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

/**
 * Résultat d'une lecture de session. `failure` distingue, quand `user` est null, un cookie refusé pour une raison
 * attendue (`rejected` : expiré, révoqué, invalide, compte supprimé ou désactivé) d'une panne (`unavailable` : SDK
 * Admin, réseau, certificats), et vaut null sans cookie de session ni comptes actifs.
 */
export interface SessionRead {
  user: SessionUser | null;
  failure: "rejected" | "unavailable" | null;
}

async function readSession(strict: boolean): Promise<SessionRead> {
  if (!isAuthEnabled()) return { user: null, failure: null };
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return { user: null, failure: null };
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
    if (account && (!account.active || authTime * 1000 < account.validAfter)) return { user: null, failure: "rejected" };
    return {
      user: {
        uid: claims.uid,
        email: claims.email ?? null,
        name: (claims.name as string | undefined) ?? null,
        picture: (claims.picture as string | undefined) ?? null,
        authTime,
      },
      failure: null,
    };
  } catch (e) {
    // On échoue fermé (déconnecté), mais une panne du SDK Admin ou du réseau doit laisser une trace.
    if (isExpectedAuthError(e)) return { user: null, failure: "rejected" };
    logError("auth.session", e);
    return { user: null, failure: "unavailable" };
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
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => (await readSessionWithReason()).user);

/**
 * Comme `getCurrentUser`, avec la raison d'une absence d'utilisateur : refus attendu ou panne. Sert à GET /api/favorites,
 * qui ne marque l'indice de connexion « refusé » que pour un vrai refus (une panne passagère ne déconnecte personne).
 */
export const readSessionWithReason = cache((): Promise<SessionRead> => readSession(false));

/**
 * Variante stricte, pour les écritures et les opérations sensibles (export, clés d'API, partage, suppression) : même
 * contrôle, mais échec fermé si Firebase Auth ne répond pas. Sans quoi un cookie resté sur un autre appareil pourrait
 * recréer des données sous users/{uid} après la suppression du compte.
 */
export const getCurrentUserStrict = cache(async (): Promise<SessionUser | null> => (await readSessionStrictWithReason()).user);

/** Lecture stricte avec la raison d'une absence d'utilisateur (même lecture que `getCurrentUserStrict`, mémorisée). */
export const readSessionStrictWithReason = cache((): Promise<SessionRead> => readSession(true));

/**
 * Réponse d'une écriture sans utilisateur strict : 503 si la vérification de la session est en panne (Firebase Auth
 * injoignable, clés publiques indisponibles), 401 sinon. Une panne ne doit pas se présenter comme « Non connecté » :
 * le client ouvrirait la fenêtre de connexion, et la victime d'un vol qui veut tout couper lirait un faux diagnostic.
 */
export function strictRefusal(failure: SessionRead["failure"], message = "Non connecté."): NextResponse {
  if (failure === "unavailable") {
    return NextResponse.json(
      { error: "Vérification de session momentanément impossible, réessayez." },
      { status: 503, headers: { "cache-control": "private, no-store", "retry-after": "5" } },
    );
  }
  return NextResponse.json({ error: message }, { status: 401 });
}

export type StrictSession = { ok: true; user: SessionUser; refused: null } | { ok: false; user: null; refused: NextResponse };

/**
 * Garde des écritures : utilisateur strict, ou la réponse de refus tirée de la MÊME vérification. `cache()` ne mémorise
 * rien dans un gestionnaire de route : relire la session pour connaître la raison referait tout (clés publiques, getUser),
 * et une panne résorbée entre les deux lectures se présenterait comme « Non connecté ».
 */
export async function requireStrictUser(message = "Non connecté."): Promise<StrictSession> {
  const { user, failure } = await readSessionStrictWithReason();
  if (user) return { ok: true, user, refused: null };
  return { ok: false, user: null, refused: strictRefusal(failure, message) };
}

/**
 * Relit l'état du compte sans le cache de l'instance, pour une opération qui crée un accès durable (clé MCP) : une
 * révocation faite sur une autre instance il y a moins de 5 minutes compte déjà. Vrai si la session reste valable.
 * Lève une erreur si Firebase Auth ne répond pas (échec fermé, à traduire en 503 par l'appelant).
 */
export async function recheckSession(user: Pick<SessionUser, "uid" | "authTime">): Promise<boolean> {
  forgetAccountState(user.uid);
  const account = await accountState(user.uid);
  return account.active && user.authTime * 1000 >= account.validAfter;
}
