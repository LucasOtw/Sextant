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

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

/** Résultat mémorisé de la lecture de FIREBASE_SERVICE_ACCOUNT (la variable ne change pas pendant la vie du processus). */
let parsed: { ok: true; sa: ServiceAccount } | { ok: false; reason: string } | undefined;

function readServiceAccount(): { ok: true; sa: ServiceAccount } | { ok: false; reason: string } {
  if (parsed) return parsed;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return (parsed = { ok: false, reason: "FIREBASE_SERVICE_ACCOUNT manquant." });
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    // Jamais l'erreur d'origine : le message de JSON.parse peut citer un extrait de la valeur (le compte de service).
    parsed = { ok: false, reason: "FIREBASE_SERVICE_ACCOUNT invalide : JSON illisible (vérifier le collage sur une ligne)." };
    console.error(`[firebase-admin] ${parsed.reason} Comptes désactivés.`);
    return parsed;
  }
  const sa = value as Partial<Record<keyof ServiceAccount, unknown>> | null;
  const missing = (["project_id", "client_email", "private_key"] as const).filter(
    (k) => typeof sa?.[k] !== "string" || !(sa[k] as string).trim(),
  );
  if (missing.length > 0) {
    // Seuls les noms des champs absents sont journalisés, jamais leur valeur.
    parsed = { ok: false, reason: `FIREBASE_SERVICE_ACCOUNT incomplet : ${missing.join(", ")} manquant(s).` };
    console.error(`[firebase-admin] ${parsed.reason} Comptes désactivés.`);
    return parsed;
  }
  return (parsed = { ok: true, sa: value as ServiceAccount });
}

/**
 * Vrai si le compte de service est présent ET exploitable. Un JSON mal collé masque le bouton « Se connecter »
 * (et laisse une ligne dans les journaux) au lieu de faire échouer chaque connexion après le passage par Google.
 */
export function isAdminConfigured(): boolean {
  return readServiceAccount().ok;
}

async function adminApp(): Promise<App> {
  if (app) return app;
  const read = readServiceAccount();
  if (!read.ok) throw new Error(read.reason);
  const { sa } = read;
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
