import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Firebase côté serveur (SDK Admin). Identifiants dans FIREBASE_SERVICE_ACCOUNT : le JSON de la clé
 * de compte de service, sur une seule ligne. Jamais exposé au client, jamais committé.
 */
let app: App | undefined;

export function isAdminConfigured(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT);
}

function adminApp(): App {
  if (app) return app;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT manquant.");
  const sa = JSON.parse(raw) as { project_id: string; client_email: string; private_key: string };
  app =
    getApps()[0] ??
    initializeApp({
      credential: cert({
        projectId: sa.project_id,
        clientEmail: sa.client_email,
        // Les sauts de ligne de la clé arrivent échappés quand le JSON est collé sur une ligne.
        privateKey: sa.private_key.replace(/\\n/g, "\n"),
      }),
      projectId: sa.project_id,
    });
  return app;
}

export const adminAuth = () => getAuth(adminApp());
export const adminDb = () => getFirestore(adminApp());
