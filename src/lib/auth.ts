import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { adminAuth, isAdminConfigured } from "@/lib/firebase/admin";
import { isExpectedAuthError, logError } from "@/lib/log";

export const SESSION_COOKIE = "sextant_session";
/** Durée de la session : 14 jours (maximum autorisé par Firebase). */
export const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  uid: string;
  email: string | null;
  name: string | null;
  picture: string | null;
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
 * pourrait recréer des données sous users/{uid} après la suppression du compte. Une vraie déconnexion de tous les
 * appareils exigerait aussi `revokeRefreshTokens(uid)` à la déconnexion (voir SEC-08).
 */
export const getCurrentUserStrict = cache((): Promise<SessionUser | null> => readSession(true));
