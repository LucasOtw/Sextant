import "server-only";
import { after } from "next/server";
import { adminDb, isAdminConfigured } from "@/lib/firebase/admin";
import { logError } from "@/lib/log";

/**
 * Condensés IA persistés dans Firestore (`aiSummaries/{modèle}__v{version}__{article}`), communs à toutes les
 * instances et gardés d'un déploiement à l'autre : un article déjà condensé ne rappelle plus le modèle (PERF-15).
 * Écrits et lus par le serveur seulement (règles fermées au client). Ni utilisateur ni donnée personnelle : la clé ne
 * dépend que de l'article, du modèle et de la version de la consigne.
 */

/** Au-delà, la lecture est abandonnée et le condensé généré : Firestore lent ne doit pas retarder la réponse. */
const READ_BUDGET_MS = 1500;

/**
 * Identifiant du document. Le modèle est encodé : les noms OpenRouter (« meta-llama/llama-3.3-70b-instruct:free »)
 * contiennent un « / », interdit dans un identifiant de document Firestore.
 */
export function summaryDocId(model: string, promptVersion: number, workId: string): string {
  return `${encodeURIComponent(model)}__v${promptVersion}__${workId}`;
}

/** Condensé déjà enregistré, ou null (absent, base indisponible, lecture hors délai : on génère). */
export async function readStoredSummary(model: string, promptVersion: number, workId: string): Promise<string | null> {
  if (!isAdminConfigured()) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const db = await adminDb();
    const late = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), READ_BUDGET_MS);
    });
    const snap = await Promise.race([db.doc(`aiSummaries/${summaryDocId(model, promptVersion, workId)}`).get(), late]);
    const text = snap?.get("summary");
    // Expiré mais pas encore supprimé (la suppression TTL peut prendre jusqu'à un jour) : régénéré.
    const expiresAt = (snap?.get("expiresAt") as { toMillis?: () => number } | undefined)?.toMillis?.();
    if (expiresAt !== undefined && expiresAt < Date.now()) return null;
    return typeof text === "string" && text.trim() ? text : null;
  } catch (e) {
    logError("summary.read", e, { work: workId });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Durée de vie d'un condensé : `expiresAt`, champ de la politique TTL de Firestore (firestore.indexes.json). Un
 * mauvais condensé (réponse incohérente d'un petit modèle) finit ainsi par être régénéré, sans intervention.
 */
export const SUMMARY_TTL_MS = 180 * 24 * 60 * 60 * 1000;

/**
 * Enregistre un condensé réussi, après l'envoi de la réponse (`after`) : l'utilisateur n'attend pas l'écriture, et
 * Vercel garde la fonction en vie jusqu'à sa fin. Un échec est journalisé, sans effet sur la réponse.
 */
export function storeSummary(model: string, promptVersion: number, workId: string, summary: string): void {
  if (!isAdminConfigured()) return;
  after(async () => {
    try {
      const db = await adminDb();
      const { FieldValue, Timestamp } = await import("firebase-admin/firestore");
      await db.doc(`aiSummaries/${summaryDocId(model, promptVersion, workId)}`).set({
        summary,
        model,
        promptVersion,
        workId,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + SUMMARY_TTL_MS),
      });
    } catch (e) {
      logError("summary.store", e, { work: workId });
    }
  });
}
