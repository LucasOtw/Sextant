import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { adminAuth, isAdminConfigured } from "@/lib/firebase/admin";
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
 * Contrôle de révocation (compte supprimé ou désactivé, jetons révoqués) déjà réussi, par uid, pour 5 minutes.
 * Mémoire propre à chaque instance : une rafale d'écritures (cœurs, surlignages) ne coûte qu'un aller-retour.
 */
const REVOCATION_CHECK_TTL_MS = 5 * 60 * 1000;
const revocationChecked = new Map<string, number>();

/** Oublie le contrôle mémorisé (à la suppression du compte : les autres appareils sont recontrôlés aussitôt). */
export function forgetRevocationCheck(uid: string): void {
  revocationChecked.delete(uid);
}

async function readSession(strict: boolean): Promise<SessionUser | null> {
  if (!isAuthEnabled()) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const auth = await adminAuth();
    // Vérification locale (signature, expiration) : aucun appel réseau une fois les clés publiques en cache.
    let claims = await auth.verifySessionCookie(token);
    if (strict && (revocationChecked.get(claims.uid) ?? 0) < Date.now()) {
      // Contrôle de révocation : un aller-retour vers Identity Toolkit (accounts:lookup).
      claims = await auth.verifySessionCookie(token, true);
      if (revocationChecked.size > 1000) revocationChecked.clear();
      revocationChecked.set(claims.uid, Date.now() + REVOCATION_CHECK_TTL_MS);
    }
    return {
      uid: claims.uid,
      email: claims.email ?? null,
      name: (claims.name as string | undefined) ?? null,
      picture: (claims.picture as string | undefined) ?? null,
      authTime: typeof claims.auth_time === "number" ? claims.auth_time : 0,
    };
  } catch (e) {
    // On échoue fermé (déconnecté), mais une panne du SDK Admin ou du réseau doit laisser une trace.
    if (!isExpectedAuthError(e)) logError("auth.session", e);
    return null;
  }
}

/**
 * Utilisateur courant d'après le cookie de session, ou null, pour les rendus et les lectures. Mémorisé pour la
 * durée de la requête. Sans contrôle de révocation (PERF-05) : un compte supprimé ou désactivé ailleurs reste
 * reconnu jusqu'à l'expiration du cookie (14 jours au plus) pour les lectures, qui ne portent que sur ses
 * propres données (supprimées avec le compte). Une lecture ne doit donc jamais écrire sous `users/{uid}` quand le
 * profil n'existe pas (cf. `listFavoriteIds`) : elle recréerait un document orphelin pour un compte supprimé.
 * Les écritures passent par `getCurrentUserStrict`.
 */
export const getCurrentUser = cache((): Promise<SessionUser | null> => readSession(false));

/**
 * Variante stricte, pour les écritures et les opérations sensibles (export, clés d'API, partage, suppression) :
 * contrôle aussi que le compte existe, n'est pas désactivé et que ses jetons n'ont pas été révoqués. Délai de
 * détection : 5 minutes au plus (contrôle mémorisé par instance). Sans quoi un cookie resté sur un autre appareil
 * pourrait recréer des données sous users/{uid} après la suppression du compte. « Se déconnecter de tous les
 * appareils » (DELETE /api/auth/sessions) révoque les jetons : les écritures d'un cookie copié échouent alors dans
 * ce délai ; les lectures (getCurrentUser, sans contrôle) restent possibles jusqu'à l'expiration du cookie (SEC-08).
 */
export const getCurrentUserStrict = cache((): Promise<SessionUser | null> => readSession(true));
