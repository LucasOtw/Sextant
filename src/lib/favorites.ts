import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { MAX_FAVORITES, type Favorite, type FavoriteSnapshot } from "@/lib/favorites-shared";

/** Favoris d'un utilisateur : `users/{uid}/favorites/{workId}`, écrits uniquement côté serveur. */

function col(uid: string) {
  return adminDb().then((db) => db.collection(`users/${uid}/favorites`));
}

function toFavorite(data: Record<string, unknown>, id: string): Favorite {
  const ts = data.addedAt as { toDate?: () => Date } | undefined;
  return {
    id,
    title: String(data.title ?? ""),
    authors: String(data.authors ?? ""),
    authorNames: Array.isArray(data.authorNames) ? (data.authorNames as string[]) : [],
    venue: (data.venue as string | null) ?? null,
    year: (data.year as number | null) ?? null,
    doi: (data.doi as string | null) ?? null,
    type: String(data.type ?? "article"),
    isOa: Boolean(data.isOa),
    citedByCount: Number(data.citedByCount ?? 0),
    topic: (data.topic as string | null) ?? null,
    addedAt: ts?.toDate?.().toISOString() ?? null,
  };
}

export async function listFavorites(uid: string): Promise<Favorite[]> {
  const snap = await (await col(uid)).orderBy("addedAt", "desc").limit(MAX_FAVORITES).get();
  return snap.docs.map((d) => toFavorite(d.data(), d.id));
}

export async function countFavorites(uid: string): Promise<number> {
  const agg = await (await col(uid)).count().get();
  return agg.data().count;
}

export class FavoritesLimitError extends Error {}

export async function addFavorite(uid: string, s: FavoriteSnapshot): Promise<Favorite> {
  const c = await col(uid);
  const existing = await c.doc(s.id).get();
  if (!existing.exists) {
    const n = (await c.count().get()).data().count;
    if (n >= MAX_FAVORITES) throw new FavoritesLimitError(`Limite de ${MAX_FAVORITES} favoris atteinte.`);
  }
  const { FieldValue } = await import("firebase-admin/firestore");
  // L'instantané est rafraîchi à chaque ajout ; la date d'ajout d'origine est conservée.
  await c.doc(s.id).set({ ...s, addedAt: existing.exists ? existing.get("addedAt") : FieldValue.serverTimestamp() }, { merge: true });
  const saved = await c.doc(s.id).get();
  return toFavorite(saved.data() ?? {}, s.id);
}

export async function removeFavorite(uid: string, id: string): Promise<void> {
  await (await col(uid)).doc(id).delete();
}
