"use client";

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";

/**
 * Firebase côté navigateur. La config est publique (clé d'API restreinte par domaine).
 * `authDomain` = le domaine Firebase du projet par défaut : c'est la seule URL de retour connue du client OAuth
 * Google créé par Firebase. Pour utiliser notre propre domaine (NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, servi via le
 * rewrite /__/auth/* de next.config.ts), il faut d'abord ajouter https://<domaine>/__/auth/handler dans
 * Google Cloud → API et services → Identifiants → client OAuth web → URI de redirection autorisés.
 */
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

function authDomain(): string {
  return process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() || `${firebaseConfig.projectId}.firebaseapp.com`;
}

let app: FirebaseApp | undefined;

export function firebaseAuth(): Auth {
  if (!isFirebaseConfigured) throw new Error("Firebase n'est pas configuré (NEXT_PUBLIC_FIREBASE_*).");
  if (!app) {
    app =
      getApps()[0] ??
      initializeApp({
        ...firebaseConfig,
        authDomain: authDomain(),
      });
  }
  return getAuth(app);
}

export function googleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}
