import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { addFavoriteIn, favoriteFromSnapshot } from "@/lib/favorites";
import { MAX_FAVORITES, type Favorite, type FavoriteSnapshot } from "@/lib/favorites-shared";
import { MAX_COLLECTIONS, type Collection } from "@/lib/collections-shared";

/**
 * Listes : `users/{uid}/collections/{id}` = { name, articleIds[], createdAt }.
 * Un article ajouté à une liste est d'abord (ou déjà) un favori : les métadonnées vivent dans la sous-collection favorites.
 * Chaque opération tient dans une transaction et renvoie l'état résultant sans relecture.
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
  const ref = col.doc();
  await db.runTransaction(async (tx) => {
    const n = (await tx.get(col.count())).data().count;
    if (n >= MAX_COLLECTIONS) throw new CollectionsLimitError(`Limite de ${MAX_COLLECTIONS} listes atteinte.`);
    tx.set(ref, { name, articleIds: [], createdAt: FieldValue.serverTimestamp() });
  });
  return { id: ref.id, name, articleIds: [], createdAt: new Date().toISOString() };
}

export async function renameCollection(uid: string, id: string, name: string): Promise<Collection> {
  const db = await adminDb();
  const ref = db.doc(`users/${uid}/collections/${id}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new CollectionNotFoundError("Liste introuvable.");
    tx.update(ref, { name });
    return toCollection({ ...snap.data(), name }, id);
  });
}

export async function deleteCollection(uid: string, id: string): Promise<void> {
  const db = await adminDb();
  await db.doc(`users/${uid}/collections/${id}`).delete();
}

/** Ajoute l'article à la liste et l'enregistre en favori s'il ne l'est pas encore : tout ou rien. */
export async function addToCollection(uid: string, id: string, snapshot: FavoriteSnapshot): Promise<{ collection: Collection; favorite: Favorite }> {
  const db = await adminDb();
  const { FieldValue } = await import("firebase-admin/firestore");
  const userRef = db.doc(`users/${uid}`);
  const ref = userRef.collection("collections").doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new CollectionNotFoundError("Liste introuvable.");
    const current = toCollection(snap.data() ?? {}, id);
    const isNew = !current.articleIds.includes(snapshot.id);
    if (isNew && current.articleIds.length >= MAX_FAVORITES) throw new CollectionsLimitError("Cette liste est pleine.");
    const addedAt = await addFavoriteIn(tx, userRef, snapshot);
    if (isNew) tx.update(ref, { articleIds: FieldValue.arrayUnion(snapshot.id) });
    return {
      collection: isNew ? { ...current, articleIds: [...current.articleIds, snapshot.id] } : current,
      favorite: favoriteFromSnapshot(snapshot, addedAt),
    };
  });
}

/** Retire l'article de la liste (il reste en favori). */
export async function removeFromCollection(uid: string, id: string, workId: string): Promise<Collection> {
  const db = await adminDb();
  const { FieldValue } = await import("firebase-admin/firestore");
  const ref = db.doc(`users/${uid}/collections/${id}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new CollectionNotFoundError("Liste introuvable.");
    tx.update(ref, { articleIds: FieldValue.arrayRemove(workId) });
    const current = toCollection(snap.data() ?? {}, id);
    return { ...current, articleIds: current.articleIds.filter((x) => x !== workId) };
  });
}
