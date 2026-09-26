"use client";

import { useEffect, useState } from "react";
import type { Auth, GoogleAuthProvider, UserCredential } from "firebase/auth";
import { isFirebaseConfigured } from "@/lib/firebase/config";

/** L'utilisateur a fermé la fenêtre Google : rien à afficher. */
export class GooglePopupCancelled extends Error {}

interface FirebaseAuthKit {
  sdk: typeof import("firebase/auth");
  auth: Auth;
  googleProvider: () => GoogleAuthProvider;
}

let kit: Promise<FirebaseAuthKit> | null = null;
/** SDK téléchargé et initialisé : un clic peut ouvrir la fenêtre Google sans attente réseau. */
let kitReady = false;

/**
 * SDK Firebase Auth chargé à la demande (morceau séparé, ~110 Ko), puis instance initialisée ; mémorisé (PERF-02).
 * À appeler dès l'ouverture d'une fenêtre de connexion : sur mobile et Safari, `getAuth()` précharge alors l'iframe
 * Google pendant l'affichage, et `signInWithPopup` ouvre la fenêtre dans la foulée du clic (sinon le bloqueur de
 * fenêtres surgissantes l'arrêterait). Un échec (réseau, configuration absente) n'est pas mémorisé : le clic réessaie.
 */
export function loadFirebaseAuth(): Promise<FirebaseAuthKit> {
  if (!kit) {
    const loading = Promise.all([import("firebase/auth"), import("@/lib/firebase/client")]).then(([sdk, client]) => {
      const loaded = { sdk, auth: client.firebaseAuth(), googleProvider: client.googleProvider };
      kitReady = true;
      return loaded;
    });
    kit = loading;
    loading.catch(() => {
      if (kit === loading) kit = null;
    });
  }
  return kit;
}

/**
 * Précharge le SDK à l'ouverture d'une fenêtre de connexion et dit s'il est prêt (téléchargé, persistance initialisée).
 * Tant qu'il ne l'est pas, le bouton Google reste occupé : un clic pendant le téléchargement ouvrirait la fenêtre Google
 * après une attente réseau, hors de l'activation utilisateur, et Safari la bloquerait. Un échec du chargement rend
 * aussi la main (prêt = vrai) : le clic réessaie et affiche l'erreur.
 */
export function useFirebaseAuthPreload(open: boolean): boolean {
  const [ready, setReady] = useState(() => kitReady || !isFirebaseConfigured);
  useEffect(() => {
    if (!open || !isFirebaseConfigured) return;
    let live = true;
    loadFirebaseAuth()
      .then((k) => k.auth.authStateReady())
      .catch(() => undefined)
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, [open]);
  return ready;
}

/**
 * Ouvre la fenêtre Google (à appeler dans le prolongement direct d'un clic) et renvoie le jeton d'identité, puis vide
 * aussitôt l'état Firebase du navigateur (SEC-12) : le site ne se sert que du cookie de session HttpOnly, et le jeton de
 * rafraîchissement laissé dans IndexedDB par le SDK ne servirait qu'à un script injecté. `exchange` reçoit le jeton
 * et ouvre la session ; le nettoyage a lieu qu'il réussisse ou non.
 * Erreurs : GooglePopupCancelled (fenêtre fermée), ou Error au message prêt à afficher.
 */
export async function withGooglePopup<T>(exchange: (idToken: string, credential: UserCredential) => Promise<T>): Promise<T> {
  // SDK déjà prêt au moment du clic ? Sinon l'attente du téléchargement a pu faire perdre l'activation utilisateur.
  const readyAtClick = kitReady;
  const { sdk, auth, googleProvider } = await loadFirebaseAuth();
  let credential: UserCredential;
  try {
    credential = await sdk.signInWithPopup(auth, googleProvider());
  } catch (e) {
    const code = (e as { code?: string }).code;
    // Pas de repli par redirection : avec l'authDomain Firebase (autre domaine que le site), Safari 16.1+,
    // Firefox 109+ et Chrome sans cookies tiers ramènent l'utilisateur déconnecté, sans message. On explique plutôt.
    if (code === "auth/popup-blocked") {
      // Fenêtre bloquée parce qu'elle est partie après le téléchargement du SDK : un second clic suffit, pas les réglages.
      if (!readyAtClick) throw new Error("La connexion Google est prête : cliquez de nouveau sur le bouton.");
      throw new Error("Votre navigateur a bloqué la fenêtre de connexion Google. Autorisez les fenêtres surgissantes pour ce site, puis réessayez.");
    }
    if (code === "auth/operation-not-supported-in-this-environment") throw new Error("Ouvrez Sextant dans votre navigateur (Safari, Chrome…) pour vous connecter.");
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") throw new GooglePopupCancelled();
    throw e;
  }
  try {
    return await exchange(await credential.user.getIdToken(), credential);
  } finally {
    await sdk.signOut(auth).catch(() => undefined);
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
