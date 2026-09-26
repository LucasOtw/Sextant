"use client";

import { signInWithPopup, signOut, type UserCredential } from "firebase/auth";
import { firebaseAuth, googleProvider } from "@/lib/firebase/client";

/** L'utilisateur a fermé la fenêtre Google : rien à afficher. */
export class GooglePopupCancelled extends Error {}

/**
 * Ouvre la fenêtre Google (à appeler dans le prolongement direct d'un clic) et renvoie le jeton d'identité, puis vide
 * aussitôt l'état Firebase du navigateur (SEC-12) : le site ne se sert que du cookie de session HttpOnly, et le jeton de
 * rafraîchissement laissé dans IndexedDB par le SDK ne servirait qu'à un script injecté. `exchange` reçoit le jeton
 * et ouvre la session ; le nettoyage a lieu qu'il réussisse ou non.
 * Erreurs : GooglePopupCancelled (fenêtre fermée), ou Error au message prêt à afficher.
 */
export async function withGooglePopup<T>(exchange: (idToken: string, credential: UserCredential) => Promise<T>): Promise<T> {
  const auth = firebaseAuth();
  let credential: UserCredential;
  try {
    credential = await signInWithPopup(auth, googleProvider());
  } catch (e) {
    const code = (e as { code?: string }).code;
    // Pas de repli par redirection : avec l'authDomain Firebase (autre domaine que le site), Safari 16.1+,
    // Firefox 109+ et Chrome sans cookies tiers ramènent l'utilisateur déconnecté, sans message. On explique plutôt.
    if (code === "auth/popup-blocked") {
      throw new Error("Votre navigateur a bloqué la fenêtre de connexion Google. Autorisez les fenêtres surgissantes pour ce site, puis réessayez.");
    }
    if (code === "auth/operation-not-supported-in-this-environment") throw new Error("Ouvrez Sextant dans votre navigateur (Safari, Chrome…) pour vous connecter.");
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") throw new GooglePopupCancelled();
    throw e;
  }
  try {
    return await exchange(await credential.user.getIdToken(), credential);
  } finally {
    await signOut(auth).catch(() => undefined);
  }
}

/**
 * Purge l'état Firebase laissé dans le navigateur par les versions précédentes (connexion faite avant SEC-12, jamais
 * suivie d'une déconnexion) : base IndexedDB `firebaseLocalStorageDb` et repli localStorage `firebase:authUser:*`.
 * Sans charger le SDK. Appelée une fois par chargement quand une session est ouverte.
 */
let purged = false;
export function purgeStoredFirebaseAuth(): void {
  if (purged || typeof window === "undefined") return;
  purged = true;
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (key?.startsWith("firebase:authUser:")) window.localStorage.removeItem(key);
    }
  } catch {
    /* stockage indisponible (navigation privée) */
  }
  try {
    window.indexedDB?.deleteDatabase("firebaseLocalStorageDb");
  } catch {
    /* IndexedDB indisponible */
  }
}
