import "server-only";
import type { DocumentReference, DocumentSnapshot, Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { scanPages } from "@/lib/firebase/scan";
import { MAX_FAVORITES, sanitizeSnapshot, snapshotFromWork, type Favorite, type FavoriteSnapshot } from "@/lib/favorites-shared";
import { logError, recover } from "@/lib/log";
import { getWork } from "@/lib/openalex";
import { cleanText } from "@/lib/text";

/**
 * Favoris d'un utilisateur : `users/{uid}/favorites/{workId}`, écrits uniquement côté serveur.
 * Le document `users/{uid}` porte, tenus dans la même transaction que chaque ajout ou retrait :
 * - `favoriteIds` : la liste des identifiants (≤ 1000, quelques Ko) → l'état des cœurs en UNE lecture ;
 * - `favoritesCount` : le total.
 * Si ces champs manquent (favoris antérieurs à leur introduction), ils sont reconstruits depuis la sous-collection.
 * Les listes (`users/{uid}/collections`) ne référencent que des favoris : un retrait les met à jour dans la même transaction.
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

/**
 * Instantané à stocker pour un article ajouté : reconstruit depuis OpenAlex (réponse en cache une heure), jamais
 * repris du client. Seul l'identifiant envoyé compte : une liste partagée ne peut pas prêter un faux titre à un vrai
 * article, qui se recopierait chez le visiteur (favoris, exports APA/BibTeX, outils MCP). L'identifiant demandé est
 * gardé même si OpenAlex a fusionné l'article sous un autre : c'est lui que le client connaît (état des cœurs).
 * `null` : article inconnu d'OpenAlex. OpenAlex en panne : l'instantané du client, déjà borné et nettoyé par
 * `sanitizeSnapshot`, pour que l'ajout reste possible (panne journalisée).
 */
export async function verifiedSnapshot(input: FavoriteSnapshot): Promise<FavoriteSnapshot | null> {
  let work;
  try {
    work = await getWork(input.id);
  } catch (e) {
    logError("favorites.verifiedSnapshot", e, { work: input.id });
    return input;
  }
  if (!work) return null;
  // Jamais de repli sur l'instantané du client quand OpenAlex a répondu : un titre vide (ou fait seulement de
  // caractères de contrôle) devient « Sans titre », sans quoi sanitizeSnapshot refuserait et le faux titre passerait.
  const snap = snapshotFromWork(work);
  return sanitizeSnapshot({ ...snap, id: input.id, title: cleanText(snap.title, 500) || "Sans titre" });
}

/** Les favoris, du plus récent au plus ancien ; `max` borne les lectures (une par favori renvoyé). */
export async function listFavorites(uid: string, max = MAX_FAVORITES): Promise<Favorite[]> {
  const db = await adminDb();
  const snap = await db.collection(`users/${uid}/favorites`).orderBy("addedAt", "desc").limit(Math.min(max, MAX_FAVORITES)).get();
  return snap.docs.map((d) => toFavorite(d.data(), d.id));
}

/** Les favoris qui correspondent à `match`, lus par pages jusqu'à en trouver `limit` ou à en avoir parcouru `max`. */
export async function findFavorites(uid: string, match: (f: Favorite) => boolean, limit: number, max: number): Promise<Favorite[]> {
  const db = await adminDb();
  const query = db.collection(`users/${uid}/favorites`).orderBy("addedAt", "desc");
  return scanPages(query, (d) => toFavorite(d.data(), d.id), match, limit, Math.min(max, MAX_FAVORITES));
}

/** Les favoris demandés, dans l'ordre donné (les absents sont ignorés) : `getAll` par paquets de 100, en parallèle. */
export async function getFavoritesByIds(uid: string, ids: string[]): Promise<Favorite[]> {
  if (ids.length === 0) return [];
  const db = await adminDb();
  const col = db.collection(`users/${uid}/favorites`);
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
  const pages = await Promise.all(chunks.map((chunk) => db.getAll(...chunk.map((id) => col.doc(id)))));
  return pages.flat().flatMap((d) => (d.exists ? [toFavorite(d.data() ?? {}, d.id)] : []));
}

/** Identifiants des favoris (une lecture), reconstruits et persistés une fois si le champ manque d'un profil existant. */
export async function listFavoriteIds(uid: string): Promise<string[]> {
  const db = await adminDb();
  const userRef = db.doc(`users/${uid}`);
  const user = await userRef.get();
  // Profil absent (compte supprimé, cookie encore valide ailleurs) : ne rien recréer sous users/{uid}.
  if (!user.exists) return [];
  const ids = user.get("favoriteIds");
  if (Array.isArray(ids)) return ids.filter((x): x is string => typeof x === "string");
  const snap = await userRef.collection("favorites").select().get();
  const rebuilt = snap.docs.map((d) => d.id);
  await userRef.set({ favoriteIds: rebuilt, favoritesCount: rebuilt.length }, { merge: true }).catch(recover("favorites.rebuildIndex", undefined));
  return rebuilt;
}

/** Nombre de favoris ; `user` évite de relire `users/{uid}` quand l'appelant l'a déjà chargé (page compte). */
export async function countFavorites(uid: string, user?: DocumentSnapshot): Promise<number> {
  user ??= await (await adminDb()).doc(`users/${uid}`).get();
  const n = user.get("favoritesCount");
  if (typeof n === "number") return Math.max(0, n);
  return (await listFavoriteIds(uid)).length;
}

export async function isFavorite(uid: string, id: string): Promise<boolean> {
  return (await listFavoriteIds(uid)).includes(id);
}

export class FavoritesLimitError extends Error {}

/**
 * Écritures d'un ajout (ou rafraîchissement) de favori, au sein d'une transaction : lectures d'abord, écritures ensuite.
 * Renvoie la date d'ajout (celle d'origine si l'article était déjà enregistré).
 */
export async function addFavoriteIn(tx: Transaction, userRef: DocumentReference, s: FavoriteSnapshot): Promise<Date> {
  const { FieldValue } = await import("firebase-admin/firestore");
  const favRef = userRef.collection("favorites").doc(s.id);
  const [user, existing] = await Promise.all([tx.get(userRef), tx.get(favRef)]);
  const known = user.get("favoriteIds");
  // Liste de référence : le champ s'il existe, sinon la sous-collection (rattrapage des anciens favoris).
  const ids: string[] = Array.isArray(known)
    ? known.filter((x): x is string => typeof x === "string")
    : (await tx.get(userRef.collection("favorites").select())).docs.map((d) => d.id);
  if (!existing.exists && !ids.includes(s.id)) {
    if (ids.length >= MAX_FAVORITES) throw new FavoritesLimitError(`Limite de ${MAX_FAVORITES} favoris atteinte.`);
    ids.push(s.id);
  }
  const previous = existing.exists ? (existing.get("addedAt") as { toDate?: () => Date } | undefined) : undefined;
  tx.set(userRef, { favoriteIds: ids, favoritesCount: ids.length }, { merge: true });
  // L'instantané est rafraîchi à chaque ajout ; la date d'ajout d'origine est conservée.
  tx.set(favRef, { ...s, addedAt: previous ?? FieldValue.serverTimestamp() }, { merge: true });
  return previous?.toDate?.() ?? new Date();
}

/** Le favori tel que renvoyé au client, sans relecture après écriture. */
export function favoriteFromSnapshot(s: FavoriteSnapshot, addedAt: Date): Favorite {
  return { ...toFavorite(s as unknown as Record<string, unknown>, s.id), addedAt: addedAt.toISOString() };
}

export async function addFavorite(uid: string, s: FavoriteSnapshot): Promise<Favorite> {
  const db = await adminDb();
  const userRef = db.doc(`users/${uid}`);
  const addedAt = await db.runTransaction((tx) => addFavoriteIn(tx, userRef, s));
  return favoriteFromSnapshot(s, addedAt);
}

/** Retire le favori et le sort de toutes les listes qui le contenaient, en une seule transaction. */
export async function removeFavorite(uid: string, id: string): Promise<void> {
  const db = await adminDb();
  const { FieldValue } = await import("firebase-admin/firestore");
  const userRef = db.doc(`users/${uid}`);
  const favRef = userRef.collection("favorites").doc(id);
  await db.runTransaction(async (tx) => {
    const [user, existing, lists] = await Promise.all([
      tx.get(userRef),
      tx.get(favRef),
      tx.get(userRef.collection("collections").where("articleIds", "array-contains", id)),
    ]);
    const known = user.get("favoriteIds");
    const ids: string[] = Array.isArray(known)
      ? known.filter((x): x is string => typeof x === "string")
      : (await tx.get(userRef.collection("favorites").select())).docs.map((d) => d.id);
    const next = ids.filter((x) => x !== id);
    tx.set(userRef, { favoriteIds: next, favoritesCount: next.length }, { merge: true });
    if (existing.exists) tx.delete(favRef);
    lists.docs.forEach((d) => tx.update(d.ref, { articleIds: FieldValue.arrayRemove(id) }));
  });
}
