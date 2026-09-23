"use client";

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";

/**
 * Firebase côté navigateur. La config est publique (clé d'API restreinte par domaine).
 * `authDomain` = l'hôte du site en production (NEXT_PUBLIC_SITE_HOST, autorisé côté Firebase) : les pages d'aide
 * de connexion sont servies via un rewrite (voir next.config.ts), ce qui évite les blocages de cookies tiers.
 * Partout ailleurs (localhost en http, URL d'aperçu Vercel non autorisée…), on retombe sur le domaine Firebase.
 */
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

/** Hôte de production, seul domaine « à nous » déclaré dans les domaines autorisés Firebase. */
const SITE_HOST = process.env.NEXT_PUBLIC_SITE_HOST ?? "sextant-psi.vercel.app";

function authDomain(): string {
  const fallback = `${firebaseConfig.projectId}.firebaseapp.com`;
  if (typeof window === "undefined") return fallback;
  const { protocol, host } = window.location;
  return protocol === "https:" && host === SITE_HOST ? host : fallback;
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
