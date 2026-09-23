"use client";

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";

/**
 * Firebase côté navigateur. La config est publique (clé d'API restreinte par domaine).
 * `authDomain` = l'hôte courant en https : les pages d'aide de connexion sont servies via un rewrite
 * (voir next.config.ts), ce qui évite les blocages de cookies tiers sur Safari et Chrome.
 * En http (développement local), le SDK force https:// devant ce domaine, donc on retombe sur le domaine Firebase.
 */
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

let app: FirebaseApp | undefined;

export function firebaseAuth(): Auth {
  if (!isFirebaseConfigured) throw new Error("Firebase n'est pas configuré (NEXT_PUBLIC_FIREBASE_*).");
  if (!app) {
    app =
      getApps()[0] ??
      initializeApp({
        ...firebaseConfig,
        authDomain:
          typeof window !== "undefined" && window.location.protocol === "https:"
            ? window.location.host
            : `${firebaseConfig.projectId}.firebaseapp.com`,
      });
  }
  return getAuth(app);
}

export function googleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}
