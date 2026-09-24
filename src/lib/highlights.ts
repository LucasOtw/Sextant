import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { scanPages } from "@/lib/firebase/scan";
import { MAX_HIGHLIGHTS, type Highlight, type HighlightInput } from "@/lib/highlights-shared";
import type { FavoriteSnapshot } from "@/lib/favorites-shared";

/** `users/{uid}/highlights/{id}` : passage, page, note, source, contexte, article dénormalisé, date. Écrit côté serveur seulement. */

function toHighlight(data: Record<string, unknown>, id: string): Highlight {
  const ts = data.createdAt as { toDate?: () => Date } | undefined;
  const article = (data.article ?? {}) as Partial<FavoriteSnapshot>;
  return {
    id,
    workId: String(data.workId ?? ""),
    text: String(data.text ?? ""),
    page: typeof data.page === "number" ? data.page : null,
    note: String(data.note ?? ""),
    source: (data.source as Highlight["source"]) ?? "manual",
    prefix: String(data.prefix ?? ""),
    suffix: String(data.suffix ?? ""),
    article: {
      id: String(article.id ?? data.workId ?? ""),
      title: String(article.title ?? ""),
      authors: String(article.authors ?? ""),
      authorNames: Array.isArray(article.authorNames) ? article.authorNames : [],
      venue: article.venue ?? null,
      year: article.year ?? null,
      doi: article.doi ?? null,
      type: String(article.type ?? "article"),
      isOa: Boolean(article.isOa),
      citedByCount: Number(article.citedByCount ?? 0),
      topic: article.topic ?? null,
    },
    createdAt: ts?.toDate?.().toISOString() ?? null,
  };
}

export class HighlightsLimitError extends Error {}
export class HighlightNotFoundError extends Error {}

/**
 * Les surlignages (les plus récents d'abord), ou ceux d'un article (sans index composite : triés ici).
 * `max` borne les lectures (une par surlignage renvoyé).
 */
export async function listHighlights(uid: string, workId?: string, max = MAX_HIGHLIGHTS): Promise<Highlight[]> {
  const db = await adminDb();
  const col = db.collection(`users/${uid}/highlights`);
  const n = Math.min(max, MAX_HIGHLIGHTS);
  const snap = workId ? await col.where("workId", "==", workId).limit(n).get() : await col.orderBy("createdAt", "desc").limit(n).get();
  const items = snap.docs.map((d) => toHighlight(d.data(), d.id));
  return workId ? items.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")) : items;
}

/** Les surlignages (les plus récents d'abord) qui correspondent à `match`, lus par pages et seulement jusqu'à en trouver `limit`. */
export async function findHighlights(uid: string, match: (h: Highlight) => boolean, limit: number): Promise<Highlight[]> {
  const db = await adminDb();
  const query = db.collection(`users/${uid}/highlights`).orderBy("createdAt", "desc");
  return scanPages(query, (d) => toHighlight(d.data(), d.id), match, limit, MAX_HIGHLIGHTS);
}

export async function countHighlights(uid: string): Promise<number> {
  const db = await adminDb();
  return (await db.collection(`users/${uid}/highlights`).count().get()).data().count;
}

export async function createHighlight(uid: string, input: HighlightInput): Promise<Highlight> {
  const db = await adminDb();
  const { FieldValue } = await import("firebase-admin/firestore");
  const col = db.collection(`users/${uid}/highlights`);
  const ref = col.doc();
  await db.runTransaction(async (tx) => {
    const n = (await tx.get(col.count())).data().count;
    if (n >= MAX_HIGHLIGHTS) throw new HighlightsLimitError(`Limite de ${MAX_HIGHLIGHTS} surlignages atteinte.`);
    tx.set(ref, { ...input, workId: input.article.id, createdAt: FieldValue.serverTimestamp() });
  });
  return { ...input, id: ref.id, workId: input.article.id, createdAt: new Date().toISOString() };
}

export async function updateHighlightNote(uid: string, id: string, note: string): Promise<void> {
  const db = await adminDb();
  const ref = db.doc(`users/${uid}/highlights/${id}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HighlightNotFoundError("Surlignage introuvable.");
    tx.update(ref, { note });
  });
}

export async function deleteHighlight(uid: string, id: string): Promise<void> {
  const db = await adminDb();
  await db.doc(`users/${uid}/highlights/${id}`).delete();
}
