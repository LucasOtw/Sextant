import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import type { FeedbackItem, FeedbackKind, FeedbackStatus } from "@/lib/feedback-shared";

/**
 * `feedback/{id}` = { kind, title, description, votes, status, authorUid, createdAt } — public, sans nom d'auteur.
 * Un vote = `users/{uid}/feedbackVotes/{id}` ; il est posé ou retiré dans la même transaction que le compteur,
 * et disparaît avec le compte (le compteur, anonyme, reste).
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
