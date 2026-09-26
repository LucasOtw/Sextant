import "server-only";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { FavoriteSnapshot } from "@/lib/favorites-shared";
import { MAX_NOTES, type ArticleNote } from "@/lib/notes-shared";

/** `users/{uid}/notes/{workId}` = { text, article, updatedAt }. Une note vide supprime le document. */

export class NotesLimitError extends Error {}

function toNote(data: Record<string, unknown>, workId: string): ArticleNote {
  const ts = data.updatedAt as { toDate?: () => Date } | undefined;
  const a = (data.article ?? {}) as Partial<FavoriteSnapshot>;
  return {
    workId,
    text: String(data.text ?? ""),
    article: {
      id: String(a.id ?? workId),
      title: String(a.title ?? ""),
      authors: String(a.authors ?? ""),
      authorNames: Array.isArray(a.authorNames) ? a.authorNames : [],
      venue: a.venue ?? null,
      year: a.year ?? null,
      doi: a.doi ?? null,
      type: String(a.type ?? "article"),
      isOa: Boolean(a.isOa),
      citedByCount: Number(a.citedByCount ?? 0),
      topic: a.topic ?? null,
    },
    updatedAt: ts?.toDate?.().toISOString() ?? null,
  };
}

export async function getNote(uid: string, workId: string): Promise<ArticleNote | null> {
  const db = await adminDb();
  const snap = await db.doc(`users/${uid}/notes/${workId}`).get();
  return snap.exists ? toNote(snap.data() ?? {}, workId) : null;
}

export async function listNotes(uid: string, limit = 500): Promise<ArticleNote[]> {
  const db = await adminDb();
  const snap = await db.collection(`users/${uid}/notes`).orderBy("updatedAt", "desc").limit(limit).get();
  return snap.docs.map((d) => toNote(d.data(), d.id));
}

/**
 * Toutes les notes, lues par pages (export RGPD, art. 15 et 20) : aucune n'est omise, même au-delà du plafond
 * (un compte peut l'avoir dépassé avant son ajout). `pageSize` n'est réglé que par les tests.
 */
export async function listAllNotes(uid: string, pageSize = 500): Promise<ArticleNote[]> {
  const db = await adminDb();
  const query = db.collection(`users/${uid}/notes`).orderBy("updatedAt", "desc").limit(pageSize);
  const notes: ArticleNote[] = [];
  let last: QueryDocumentSnapshot | undefined;
  for (;;) {
    const snap = await (last ? query.startAfter(last) : query).get();
    notes.push(...snap.docs.map((d) => toNote(d.data(), d.id)));
    if (snap.size < pageSize) return notes;
    last = snap.docs[snap.docs.length - 1];
  }
}

export async function countNotes(uid: string): Promise<number> {
  const db = await adminDb();
  return (await db.collection(`users/${uid}/notes`).count().get()).data().count;
}

/** Enregistre (texte non vide) ou efface (texte vide) la note de l'article. */
export async function setNote(uid: string, article: FavoriteSnapshot, text: string): Promise<ArticleNote | null> {
  const db = await adminDb();
  const { FieldValue } = await import("firebase-admin/firestore");
  const ref = db.doc(`users/${uid}/notes/${article.id}`);
  if (!text) {
    await ref.delete();
    return null;
  }
  const col = db.collection(`users/${uid}/notes`);
  // Plafond compté dans la transaction, et seulement pour une nouvelle note : modifier une note existante reste
  // possible une fois le plafond atteint (SEC-19).
  await db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (!current.exists) {
      const n = (await tx.get(col.count())).data().count;
      if (n >= MAX_NOTES) throw new NotesLimitError(`Limite de ${MAX_NOTES} notes atteinte : supprimez-en avant d'en écrire une nouvelle.`);
    }
    tx.set(ref, { text, article, workId: article.id, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  return { workId: article.id, text, article, updatedAt: new Date().toISOString() };
}
