import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { MAX_FAVORITES, type Favorite, type FavoriteSnapshot } from "@/lib/favorites-shared";

/**
 * Favoris d'un utilisateur : `users/{uid}/favorites/{workId}`, écrits uniquement côté serveur.
 * Un compteur `favoritesCount` sur `users/{uid}` est tenu dans la même transaction que chaque
 * ajout ou retrait : lecture du total en un seul document, limite appliquée sans course.
 */

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
  const db = await adminDb();
  const snap = await db.collection(`users/${uid}/favorites`).orderBy("addedAt", "desc").limit(MAX_FAVORITES).get();
  return snap.docs.map((d) => toFavorite(d.data(), d.id));
}

export async function isFavorite(uid: string, id: string): Promise<boolean> {
  const db = await adminDb();
  return (await db.doc(`users/${uid}/favorites/${id}`).get()).exists;
}

export async function countFavorites(uid: string): Promise<number> {
  const db = await adminDb();
  const user = await db.doc(`users/${uid}`).get();
  const n = user.get("favoritesCount");
  if (typeof n === "number") return Math.max(0, n);
  const agg = await db.collection(`users/${uid}/favorites`).count().get();
  return agg.data().count;
}

export class FavoritesLimitError extends Error {}

export async function addFavorite(uid: string, s: FavoriteSnapshot): Promise<Favorite> {
  const db = await adminDb();
  const { FieldValue } = await import("firebase-admin/firestore");
  const userRef = db.doc(`users/${uid}`);
  const favRef = userRef.collection("favorites").doc(s.id);

  await db.runTransaction(async (tx) => {
    const [user, existing] = await Promise.all([tx.get(userRef), tx.get(favRef)]);
    if (!existing.exists) {
      const current = typeof user.get("favoritesCount") === "number" ? (user.get("favoritesCount") as number) : 0;
      if (current >= MAX_FAVORITES) throw new FavoritesLimitError(`Limite de ${MAX_FAVORITES} favoris atteinte.`);
      tx.set(userRef, { favoritesCount: current + 1 }, { merge: true });
    }
    // L'instantané est rafraîchi à chaque ajout ; la date d'ajout d'origine est conservée.
    tx.set(favRef, { ...s, addedAt: existing.exists ? existing.get("addedAt") : FieldValue.serverTimestamp() }, { merge: true });
  });

  const saved = await favRef.get();
  return toFavorite(saved.data() ?? {}, s.id);
}

export async function removeFavorite(uid: string, id: string): Promise<void> {
  const db = await adminDb();
  const userRef = db.doc(`users/${uid}`);
  const favRef = userRef.collection("favorites").doc(id);
  await db.runTransaction(async (tx) => {
    const [user, existing] = await Promise.all([tx.get(userRef), tx.get(favRef)]);
    if (!existing.exists) return;
    const current = typeof user.get("favoritesCount") === "number" ? (user.get("favoritesCount") as number) : 1;
    tx.set(userRef, { favoritesCount: Math.max(0, current - 1) }, { merge: true });
    tx.delete(favRef);
  });
}
