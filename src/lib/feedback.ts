import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { logError } from "@/lib/log";
import type { FeedbackItem, FeedbackKind, FeedbackStatus } from "@/lib/feedback-shared";

/**
 * `feedback/{id}` = { kind, title, description, votes, status, authorUid, createdAt } — public, sans nom d'auteur.
 * Un vote = `users/{uid}/feedbackVotes/{id}` ; il est posé ou retiré dans la même transaction que le compteur.
 * À la suppression du compte, ses votes sont retirés des compteurs (withdrawVotes) : un compte supprimé puis recréé
 * ne peut pas revoter pour gonfler le classement (SEC-14), et aucune trace du vote ne survit au compte (RGPD).
 */

const STATUSES: FeedbackStatus[] = ["open", "planned", "done", "declined"];

function toItem(id: string, d: Record<string, unknown>): FeedbackItem {
  const ts = d.createdAt as { toDate?: () => Date } | undefined;
  return {
    id,
    kind: d.kind === "bug" ? "bug" : "idea",
    title: String(d.title ?? ""),
    description: String(d.description ?? ""),
    votes: Math.max(0, Number(d.votes ?? 0)),
    status: STATUSES.includes(d.status as FeedbackStatus) ? (d.status as FeedbackStatus) : "open",
    createdAt: ts?.toDate?.().toISOString() ?? null,
  };
}

export async function listFeedback(limit = 300): Promise<FeedbackItem[]> {
  const db = await adminDb();
  const snap = await db.collection("feedback").orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((d) => toItem(d.id, d.data()));
}

const FEEDBACK_TAG = "feedback";

/**
 * Liste publique de /retours mise en cache 60 s, partagée entre les instances (cache de données de Next) : les visites,
 * robots compris, ne relisent plus jusqu'à 300 documents chacune (PERF-08). Chaque écriture qui change la liste ou
 * un compteur appelle `refreshFeedbackList` : l'auteur d'un vote ou d'un sujet revoit la page à jour.
 */
export const listFeedbackCached = unstable_cache(() => listFeedback(), ["feedback-list"], { tags: [FEEDBACK_TAG], revalidate: 60 });

/** Vide le cache de la liste de /retours : la prochaine visite relit la base. Peut lever (hors requête Next) : passer par `refreshFeedbackList`. */
export function invalidateFeedbackList(): void {
  revalidateTag(FEEDBACK_TAG, { expire: 0 });
}

/**
 * `invalidateFeedbackList` après une écriture déjà faite, sans jamais lever : un échec de l'invalidation (hors contexte
 * de requête Next, cache indisponible) est journalisé, et la liste se relit au plus tard après 60 s. L'écriture ne doit
 * pas être présentée comme un échec pour autant.
 */
export function refreshFeedbackList(scope: string): void {
  try {
    invalidateFeedbackList();
  } catch (e) {
    logError(scope, e);
  }
}

/** Identifiants des sujets pour lesquels l'utilisateur a voté. */
export async function userFeedbackVotes(uid: string): Promise<string[]> {
  const db = await adminDb();
  const snap = await db.collection(`users/${uid}/feedbackVotes`).select().get();
  return snap.docs.map((d) => d.id);
}

/** Crée un sujet ; son auteur vote d'office pour lui. */
export async function createFeedback(uid: string, input: { kind: FeedbackKind; title: string; description: string }): Promise<FeedbackItem> {
  const db = await adminDb();
  const { FieldValue } = await import("firebase-admin/firestore");
  const ref = db.collection("feedback").doc();
  const batch = db.batch();
  batch.set(ref, { ...input, votes: 1, status: "open", authorUid: uid, createdAt: FieldValue.serverTimestamp() });
  batch.set(db.doc(`users/${uid}/feedbackVotes/${ref.id}`), { createdAt: FieldValue.serverTimestamp() });
  await batch.commit();
  return { id: ref.id, ...input, votes: 1, status: "open", createdAt: new Date().toISOString() };
}

export class FeedbackNotFoundError extends Error {}

/** Ajoute ou retire le vote de l'utilisateur ; renvoie le nouveau compte et l'état du vote. */
export async function toggleVote(uid: string, id: string): Promise<{ votes: number; voted: boolean }> {
  const db = await adminDb();
  const { FieldValue } = await import("firebase-admin/firestore");
  const itemRef = db.doc(`feedback/${id}`);
  const voteRef = db.doc(`users/${uid}/feedbackVotes/${id}`);
  return db.runTransaction(async (tx) => {
    const [item, vote] = await Promise.all([tx.get(itemRef), tx.get(voteRef)]);
    if (!item.exists) throw new FeedbackNotFoundError("Sujet introuvable.");
    const current = Math.max(0, Number(item.get("votes") ?? 0));
    if (vote.exists) {
      tx.delete(voteRef);
      tx.update(itemRef, { votes: Math.max(0, current - 1) });
      return { votes: Math.max(0, current - 1), voted: false };
    }
    tx.set(voteRef, { createdAt: FieldValue.serverTimestamp() });
    tx.update(itemRef, { votes: current + 1 });
    return { votes: current + 1, voted: true };
  });
}

/** Suppression du compte : ses sujets restent (utiles à tous) mais ne lui sont plus rattachés. */
export async function detachAuthor(uid: string): Promise<void> {
  const db = await adminDb();
  const snap = await db.collection("feedback").where("authorUid", "==", uid).get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.update(d.ref, { authorUid: null }));
  await batch.commit();
}

/** Paires (compteur, vote) par transaction : 250 lectures et 500 écritures, sous la limite de Firestore. */
const WITHDRAW_CHUNK = 250;

/**
 * Suppression du compte : retire chacun de ses votes du compteur du sujet, avant l'effacement de `users/{uid}`.
 * Chaque vote est supprimé dans la même transaction que la décrémentation de son compteur : l'opération est
 * idempotente. Si la suppression du compte échoue ensuite et qu'elle est relancée (ou si l'utilisateur garde son
 * compte), seuls les votes pas encore retirés sont relus : aucun sujet ne perd deux voix pour un vote. Un sujet
 * supprimé entre-temps n'a plus de compteur : le vote est supprimé seul. Pas de limite au nombre de votes (par paquets).
 */
export async function withdrawVotes(uid: string): Promise<void> {
  const ids = await userFeedbackVotes(uid);
  if (ids.length === 0) return;
  const db = await adminDb();
  for (let i = 0; i < ids.length; i += WITHDRAW_CHUNK) {
    const chunk = ids.slice(i, i + WITHDRAW_CHUNK);
    await db.runTransaction(async (tx) => {
      const voteRefs = chunk.map((id) => db.doc(`users/${uid}/feedbackVotes/${id}`));
      const itemRefs = chunk.map((id) => db.doc(`feedback/${id}`));
      const docs = await tx.getAll(...voteRefs, ...itemRefs);
      chunk.forEach((_, k) => {
        // Vote déjà retiré (appel concurrent) : rien à décompter.
        if (!docs[k].exists) return;
        const item = docs[chunk.length + k];
        if (item.exists) tx.update(itemRefs[k], { votes: Math.max(0, Number(item.get("votes") ?? 0) - 1) });
        tx.delete(voteRefs[k]);
      });
    });
  }
}
