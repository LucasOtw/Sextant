import "server-only";
import type { App } from "firebase-admin/app";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";

/**
 * Firebase côté serveur (SDK Admin). Identifiants dans FIREBASE_SERVICE_ACCOUNT : le JSON de la clé
 * de compte de service, sur une seule ligne. Jamais exposé au client, jamais committé.
 *
 * Les modules firebase-admin sont importés à la demande : si leur chargement échoue dans un
 * environnement donné, l'erreur est attrapable et le reste du site continue de fonctionner sans comptes.
 */
let app: App | undefined;

export function isAdminConfigured(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT);
}

async function adminApp(): Promise<App> {
  if (app) return app;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT manquant.");
  const sa = JSON.parse(raw) as { project_id: string; client_email: string; private_key: string };
  const { cert, getApps, initializeApp } = await import("firebase-admin/app");
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

export async function adminAuth(): Promise<Auth> {
  const { getAuth } = await import("firebase-admin/auth");
  return getAuth(await adminApp());
}

export async function adminDb(): Promise<Firestore> {
  const { getFirestore } = await import("firebase-admin/firestore");
  return getFirestore(await adminApp());
}
