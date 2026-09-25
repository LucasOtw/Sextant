"use client";

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import { firebaseConfig, isFirebaseConfigured } from "@/lib/firebase/config";

/**
 * Firebase côté navigateur. Module chargé à la demande seulement (components/auth/google-popup.ts,
 * `loadFirebaseAuth`) : ni firebase/app ni firebase/auth dans le JavaScript commun des pages (PERF-02).
 * `authDomain` = le domaine Firebase du projet par défaut : c'est la seule URL de retour connue du client OAuth
 * Google créé par Firebase. Pour utiliser notre propre domaine (NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, servi via le
 * rewrite /__/auth/* de next.config.ts), il faut d'abord ajouter https://<domaine>/__/auth/handler dans
 * Google Cloud → API et services → Identifiants → client OAuth web → URI de redirection autorisés.
 */
function authDomain(): string {
  return process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() || `${firebaseConfig.projectId}.firebaseapp.com`;
}

let app: FirebaseApp | undefined;

/**
 * Émulateur Auth (développement local, `npm run dev:emu`) : la connexion Google passe par la fausse fenêtre de
 * l'émulateur, aucun compte réel n'est touché. Variable absente en production.
 */
const AUTH_EMULATOR_URL = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL?.trim();
let emulatorConnected = false;

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
  const auth = getAuth(app);
  if (AUTH_EMULATOR_URL && !emulatorConnected) {
    connectAuthEmulator(auth, AUTH_EMULATOR_URL, { disableWarnings: true });
    emulatorConnected = true;
  }
  return auth;
}

export function googleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}
