import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import type { FavoriteSnapshot } from "@/lib/favorites-shared";
import type { ArticleNote } from "@/lib/notes-shared";

/** `users/{uid}/notes/{workId}` = { text, article, updatedAt }. Une note vide supprime le document. */

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
  await ref.set({ text, article, workId: article.id, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { workId: article.id, text, article, updatedAt: new Date().toISOString() };
}
