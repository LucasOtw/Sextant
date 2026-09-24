import "server-only";
import { randomBytes } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";
import { CollectionNotFoundError } from "@/lib/collections";
import type { FavoriteSnapshot } from "@/lib/favorites-shared";

/**
 * Partage d'une liste en lecture seule.
 * `shares/{token}` = { uid, collectionId, createdAt } (collection de premier niveau : la page publique retrouve la liste
 * sans connaître l'utilisateur) ; la liste porte `shareToken`. Les deux sont écrits et effacés ensemble, en transaction.
 * La page publique ne montre que le nom, la description et les articles : jamais les notes, citations ni le profil.
 */

export async function createShare(uid: string, collectionId: string): Promise<string> {
  const db = await adminDb();
  const { FieldValue } = await import("firebase-admin/firestore");
  const ref = db.doc(`users/${uid}/collections/${collectionId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new CollectionNotFoundError("Liste introuvable.");
    const existing = snap.get("shareToken");
    if (typeof existing === "string") {
      const share = await tx.get(db.doc(`shares/${existing}`));
      if (share.exists) return existing;
    }
    const token = randomBytes(16).toString("base64url");
    tx.set(db.doc(`shares/${token}`), { uid, collectionId, createdAt: FieldValue.serverTimestamp() });
    tx.update(ref, { shareToken: token });
    return token;
  });
}

export async function revokeShare(uid: string, collectionId: string): Promise<void> {
  const db = await adminDb();
  const { FieldValue } = await import("firebase-admin/firestore");
  const ref = db.doc(`users/${uid}/collections/${collectionId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new CollectionNotFoundError("Liste introuvable.");
    const token = snap.get("shareToken");
    if (typeof token === "string") tx.delete(db.doc(`shares/${token}`));
    tx.update(ref, { shareToken: FieldValue.delete() });
  });
}

export interface SharedList {
  name: string;
  description: string;
  articles: FavoriteSnapshot[];
}

/** La liste derrière un lien, ou null si le lien n'existe pas ou a été désactivé. Articles dans l'ordre de la liste. */
export async function getSharedList(token: string): Promise<SharedList | null> {
  const db = await adminDb();
  const share = await db.doc(`shares/${token}`).get();
  if (!share.exists) return null;
  const uid = share.get("uid");
  const collectionId = share.get("collectionId");
  if (typeof uid !== "string" || typeof collectionId !== "string") return null;
  const list = await db.doc(`users/${uid}/collections/${collectionId}`).get();
  // Double vérification : le jeton doit toujours être celui de la liste (désactivation, suppression).
  if (!list.exists || list.get("shareToken") !== token) return null;
  const ids = (list.get("articleIds") as unknown[] | undefined)?.filter((x): x is string => typeof x === "string") ?? [];
  const favorites = db.collection(`users/${uid}/favorites`);
  const articles: FavoriteSnapshot[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    if (chunk.length === 0) break;
    const docs = await db.getAll(...chunk.map((id) => favorites.doc(id)));
    for (const d of docs) {
      if (!d.exists) continue;
      const x = d.data() ?? {};
      articles.push({
        id: d.id,
        title: String(x.title ?? ""),
        authors: String(x.authors ?? ""),
        authorNames: Array.isArray(x.authorNames) ? (x.authorNames as string[]) : [],
        venue: (x.venue as string | null) ?? null,
        year: (x.year as number | null) ?? null,
        doi: (x.doi as string | null) ?? null,
        type: String(x.type ?? "article"),
        isOa: Boolean(x.isOa),
        citedByCount: Number(x.citedByCount ?? 0),
        topic: (x.topic as string | null) ?? null,
      });
    }
  }
  return { name: String(list.get("name") ?? ""), description: String(list.get("description") ?? ""), articles };
}
