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

/** Utilisateur courant d'après le cookie de session, ou null. Mémorisé pour la durée de la requête. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  if (!isAuthEnabled()) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const claims = await (await adminAuth()).verifySessionCookie(token, true);
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
});
