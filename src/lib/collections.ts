import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { addFavorite } from "@/lib/favorites";
import { MAX_FAVORITES, type Favorite, type FavoriteSnapshot } from "@/lib/favorites-shared";
import { MAX_COLLECTIONS, type Collection } from "@/lib/collections-shared";

/**
 * Listes : `users/{uid}/collections/{id}` = { name, articleIds[], createdAt }.
 * Un article ajouté à une liste est d'abord (ou déjà) un favori : les métadonnées vivent dans la sous-collection favorites.
 */

function toCollection(data: Record<string, unknown>, id: string): Collection {
  const ts = data.createdAt as { toDate?: () => Date } | undefined;
  return {
    id,
    name: String(data.name ?? ""),
    articleIds: Array.isArray(data.articleIds) ? (data.articleIds as unknown[]).filter((x): x is string => typeof x === "string") : [],
    createdAt: ts?.toDate?.().toISOString() ?? null,
  };
}

export class CollectionsLimitError extends Error {}
export class CollectionNotFoundError extends Error {}

export async function listCollections(uid: string): Promise<Collection[]> {
  const db = await adminDb();
  const snap = await db.collection(`users/${uid}/collections`).orderBy("createdAt", "asc").limit(MAX_COLLECTIONS).get();
  return snap.docs.map((d) => toCollection(d.data(), d.id));
}

export async function countCollections(uid: string): Promise<number> {
  const db = await adminDb();
  return (await db.collection(`users/${uid}/collections`).count().get()).data().count;
}

export async function createCollection(uid: string, name: string): Promise<Collection> {
  const db = await adminDb();
  const { FieldValue } = await import("firebase-admin/firestore");
  const col = db.collection(`users/${uid}/collections`);
  const n = (await col.count().get()).data().count;
  if (n >= MAX_COLLECTIONS) throw new CollectionsLimitError(`Limite de ${MAX_COLLECTIONS} listes atteinte.`);
  const ref = col.doc();
  await ref.set({ name, articleIds: [], createdAt: FieldValue.serverTimestamp() });
  return toCollection((await ref.get()).data() ?? {}, ref.id);
}

export async function renameCollection(uid: string, id: string, name: string): Promise<Collection> {
  const db = await adminDb();
  const ref = db.doc(`users/${uid}/collections/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw new CollectionNotFoundError("Liste introuvable.");
  await ref.set({ name }, { merge: true });
  return toCollection({ ...snap.data(), name }, id);
}

export async function deleteCollection(uid: string, id: string): Promise<void> {
  const db = await adminDb();
  await db.doc(`users/${uid}/collections/${id}`).delete();
}

/** Ajoute l'article à la liste ; l'enregistre en favori s'il ne l'est pas encore. */
export async function addToCollection(uid: string, id: string, snapshot: FavoriteSnapshot): Promise<{ collection: Collection; favorite: Favorite }> {
  const db = await adminDb();
  const { FieldValue } = await import("firebase-admin/firestore");
  const ref = db.doc(`users/${uid}/collections/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw new CollectionNotFoundError("Liste introuvable.");
  const favorite = await addFavorite(uid, snapshot);
  const current = toCollection(snap.data() ?? {}, id);
  if (!current.articleIds.includes(snapshot.id)) {
    if (current.articleIds.length >= MAX_FAVORITES) throw new CollectionsLimitError("Cette liste est pleine.");
    await ref.update({ articleIds: FieldValue.arrayUnion(snapshot.id) });
  }
  return { collection: toCollection((await ref.get()).data() ?? {}, id), favorite };
}

export async function removeFromCollection(uid: string, id: string, workId: string): Promise<Collection> {
  const db = await adminDb();
  const { FieldValue } = await import("firebase-admin/firestore");
  const ref = db.doc(`users/${uid}/collections/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw new CollectionNotFoundError("Liste introuvable.");
  await ref.update({ articleIds: FieldValue.arrayRemove(workId) });
  return toCollection((await ref.get()).data() ?? {}, id);
}

/** Quand un favori disparaît, il quitte toutes les listes qui le contenaient. */
export async function removeFromAllCollections(uid: string, workId: string): Promise<void> {
  const db = await adminDb();
  const { FieldValue } = await import("firebase-admin/firestore");
  const snap = await db.collection(`users/${uid}/collections`).where("articleIds", "array-contains", workId).get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.update(d.ref, { articleIds: FieldValue.arrayRemove(workId) }));
  await batch.commit();
}
