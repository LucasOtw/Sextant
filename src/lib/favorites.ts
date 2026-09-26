import "server-only";
import type { DocumentReference, DocumentSnapshot, Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { scanPages } from "@/lib/firebase/scan";
import { insertAt, MAX_FAVORITES, sameSnapshot, sanitizeSnapshot, snapshotForStorage, snapshotFromData, snapshotFromWork, type Favorite, type FavoritePlacement, type FavoriteSnapshot } from "@/lib/favorites-shared";
import { dateFromTimestamp, isoFromTimestamp, millisFromTimestamp } from "@/lib/firebase/decode";
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
  return { ...snapshotFromData(data, id), id, addedAt: isoFromTimestamp(data.addedAt) };
}

/** Index `favoriteIds` du profil, ou `null` s'il manque (favoris antérieurs à son introduction). */
function knownFavoriteIds(user: DocumentSnapshot): string[] | null {
  const known = user.get("favoriteIds");
  return Array.isArray(known) ? known.filter((x): x is string => typeof x === "string") : null;
}

/** Dans une transaction : les identifiants lus dans la sous-collection (rattrapage d'un profil sans index). */
async function favoriteIdsFromDocs(tx: Transaction, userRef: DocumentReference): Promise<string[]> {
  return (await tx.get(userRef.collection("favorites").select())).docs.map((d) => d.id);
}

/**
 * Instantané à stocker pour un article ajouté : reconstruit depuis OpenAlex (réponse en cache une heure), jamais
 * repris du client. Seul l'identifiant envoyé compte : une liste partagée ne peut pas prêter un faux titre à un vrai
 * article, qui se recopierait chez le visiteur (favoris, exports APA/BibTeX, outils MCP). L'identifiant demandé est
 * gardé même si OpenAlex a fusionné l'article sous un autre : c'est lui que le client connaît (état des cœurs).
 * `null` : article inconnu d'OpenAlex. OpenAlex en panne (429, 5xx, délai dépassé) : l'instantané du client, déjà
 * borné et nettoyé par `sanitizeSnapshot`, pour que l'ajout reste possible (panne journalisée), marqué
 * `verified: false` : il ne doit jamais remplacer un instantané déjà stocké (voir `addFavoriteIn`, `setNote`).
 */
export async function checkSnapshot(input: FavoriteSnapshot): Promise<{ snapshot: FavoriteSnapshot; verified: boolean } | null> {
  let work;
  try {
    work = await getWork(input.id);
  } catch (e) {
    logError("favorites.verifiedSnapshot", e, { work: input.id });
    return { snapshot: input, verified: false };
  }
  if (!work) return null;
  // Jamais de repli sur l'instantané du client quand OpenAlex a répondu : un titre vide (ou fait seulement de
  // caractères de contrôle) devient « Sans titre », sans quoi sanitizeSnapshot refuserait et le faux titre passerait.
  const snap = snapshotFromWork(work);
  const snapshot = sanitizeSnapshot({ ...snap, id: input.id, title: cleanText(snap.title, 500) || "Sans titre" });
  return snapshot ? { snapshot, verified: true } : null;
}

/** Comme `checkSnapshot`, sans l'indicateur : pour un nouveau document (citation), où rien n'est écrasé. */
export async function verifiedSnapshot(input: FavoriteSnapshot): Promise<FavoriteSnapshot | null> {
  return (await checkSnapshot(input))?.snapshot ?? null;
}

/** `storedSnapshot` au format de `checkSnapshot` : un instantané stocké n'est pas revérifié, il n'écrase donc rien. */
export async function storedCheck(uid: string, id: string): Promise<{ snapshot: FavoriteSnapshot; verified: false } | null> {
  const snapshot = await storedSnapshot(uid, id);
  return snapshot ? { snapshot, verified: false } : null;
}

/**
 * Délai pendant lequel « Annuler » peut rétablir un favori retiré avec sa date d'ajout d'origine, ou dont l'article a
 * disparu d'OpenAlex.
 */
export const RESTORE_WINDOW_MS = 10 * 60 * 1000;

/**
 * Retraits récents, gardés pour « Annuler » dans `users/{uid}.recentRemovals` : `{ [workId]: { addedAt, at } }`, la date
 * d'ajout d'origine (Timestamp, ou `null` si elle manquait) et celle du retrait. Un par article retiré, et non plus le
 * seul dernier : avec plusieurs toasts affichés, « Annuler » sur un retrait plus ancien reprend aussi sa date d'origine.
 * Une entrée est effacée au rétablissement, ou au premier retrait qui la trouve plus vieille que `RESTORE_WINDOW_MS`.
 */
type RecentRemoval = { addedAt?: unknown; at?: unknown };

function removalsMap(v: unknown): Record<string, RecentRemoval> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, RecentRemoval>) : {};
}

/** Entrée encore dans le délai d'« Annuler » ? Une date de retrait illisible compte comme expirée. */
function isRecent(entry: RecentRemoval | undefined, now: number): boolean {
  const at = millisFromTimestamp(entry?.at);
  return at !== null && now - at <= RESTORE_WINDOW_MS;
}

/** Identifiants des retraits expirés (ou illisibles) de `recentRemovals`, à effacer au passage. */
export function staleRemovals(v: unknown, now = Date.now()): string[] {
  return Object.entries(removalsMap(v)).flatMap(([id, entry]) => (isRecent(entry, now) ? [] : [id]));
}

/**
 * Retrait récent de l'article `id` : `found` s'il est encore dans le délai, avec sa date d'ajout d'origine (`null` si
 * elle était inconnue). Hors délai ou absent : `found: false`, le serveur pose la date du jour.
 */
export function recentRemoval(v: unknown, id: string, now = Date.now()): { found: boolean; addedAt: Date | null } {
  const map = removalsMap(v);
  const entry = Object.hasOwn(map, id) ? map[id] : undefined;
  if (!entry || !isRecent(entry, now)) return { found: false, addedAt: null };
  return { found: true, addedAt: dateFromTimestamp(entry.addedAt) };
}

/**
 * Instantané déjà connu pour un article qu'OpenAlex ne connaît plus (404) : celui du favori stocké, ou celui du
 * dernier favori retiré il y a moins de 10 minutes (« Annuler »). Sans lui, un favori dont la notice a été supprimée
 * ne pourrait plus être rangé dans une liste, ni rétabli après un retrait. `null` : article vraiment inconnu.
 */
export async function storedSnapshot(uid: string, id: string): Promise<FavoriteSnapshot | null> {
  const db = await adminDb();
  const userRef = db.doc(`users/${uid}`);
  const [favorite, user] = await Promise.all([userRef.collection("favorites").doc(id).get(), userRef.get()]);
  if (favorite.exists) return sanitizeSnapshot({ ...favorite.data(), id });
  const removed = user.get("lastRemovedFavorite") as { snapshot?: unknown; at?: unknown } | undefined;
  const at = millisFromTimestamp(removed?.at) ?? 0;
  if (!removed || Date.now() - at > RESTORE_WINDOW_MS) return null;
  const snapshot = sanitizeSnapshot(removed.snapshot);
  return snapshot?.id === id ? snapshot : null;
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
  const ids = knownFavoriteIds(user);
  if (ids) return ids;
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
 * N'écrit que ce qui change (NEW-9) : ranger dans une liste un favori déjà enregistré, à l'instantané inchangé, ne
 * touche ni `users/{uid}` ni le document favori. Deux listes cochées ensemble ne se disputent alors plus ces documents.
 * `verified: false` (instantané du client, OpenAlex en panne ; ou instantané déjà stocké) : écrit seulement pour un
 * nouveau favori, marqué `unverified`, jamais par-dessus un document existant. Un ajout vérifié plus tard le remplace.
 * `restored` (« Annuler » après un retrait, NEW-8) : date d'ajout et rang dans l'index d'origine, pour un article qui
 * n'est plus enregistré ; un favori présent entre-temps garde les siens.
 */
export async function addFavoriteIn(tx: Transaction, userRef: DocumentReference, s: FavoriteSnapshot, verified = true, restored?: { addedAt: Date | null; index: number | null }): Promise<Date> {
  const { FieldValue, Timestamp } = await import("firebase-admin/firestore");
  const favRef = userRef.collection("favorites").doc(s.id);
  const [user, existing] = await Promise.all([tx.get(userRef), tx.get(favRef)]);
  const known = knownFavoriteIds(user);
  // Liste de référence : le champ s'il existe, sinon la sous-collection (rattrapage des anciens favoris).
  let ids = known ?? (await favoriteIdsFromDocs(tx, userRef));
  // Absent de l'index : ajouté (en dernier, ou à son rang d'origine s'il est rétabli), y compris si son document existe
  // déjà (index désaccordé, réparé au passage). Le plafond ne vaut que pour un nouvel article : un document existant
  // compte déjà dans les favoris.
  const isNewId = !ids.includes(s.id);
  if (isNewId) {
    if (!existing.exists && ids.length >= MAX_FAVORITES) throw new FavoritesLimitError(`Limite de ${MAX_FAVORITES} favoris atteinte.`);
    ids = insertAt(ids, s.id, restored?.index ?? null);
  }
  // Valeur brute : réécrite telle quelle, la date d'ajout d'origine ne bouge pas.
  const previous: unknown = existing.exists ? existing.get("addedAt") : undefined;
  // Favori rétabli (« Annuler ») : sa date d'ajout d'origine, à défaut celle du serveur.
  const restoredAt = !existing.exists && restored?.addedAt ? restored.addedAt : null;
  // Index écrit s'il change, ou s'il vient d'être reconstruit depuis la sous-collection (anciens profils).
  if (isNewId || !known || user.get("favoritesCount") !== ids.length) {
    tx.set(userRef, { favoriteIds: ids, favoritesCount: ids.length }, { merge: true });
  }
  // L'instantané est rafraîchi s'il a changé (titre corrigé chez OpenAlex…), ou s'il n'avait pas pu être vérifié ; la
  // date d'ajout d'origine est conservée. Un instantané non vérifié ne remplace jamais un document existant.
  const storedUnverified = existing.exists && existing.get("unverified") === true;
  if (!existing.exists || (verified && (!previous || storedUnverified || !sameSnapshot(existing.data(), s)))) {
    tx.set(favRef, { ...snapshotForStorage(s), addedAt: previous ?? (restoredAt ? Timestamp.fromDate(restoredAt) : FieldValue.serverTimestamp()), unverified: verified ? FieldValue.delete() : true }, { merge: true });
  }
  return dateFromTimestamp(previous) ?? restoredAt ?? new Date();
}

/** Le favori tel que renvoyé au client, sans relecture après écriture. */
export function favoriteFromSnapshot(s: FavoriteSnapshot, addedAt: Date): Favorite {
  return { ...s, addedAt: addedAt.toISOString() };
}

export async function addFavorite(uid: string, s: FavoriteSnapshot, verified = true): Promise<Favorite> {
  const db = await adminDb();
  const userRef = db.doc(`users/${uid}`);
  const addedAt = await db.runTransaction((tx) => addFavoriteIn(tx, userRef, s, verified));
  return favoriteFromSnapshot(s, addedAt);
}

/**
 * Retire le favori et le sort de toutes les listes qui le contenaient, en une seule transaction. Son instantané est
 * gardé dans `users/{uid}.lastRemovedFavorite` (un seul, le dernier) : « Annuler » peut le rétablir même si l'article a
 * disparu d'OpenAlex entre-temps (voir `storedSnapshot`). Sa date d'ajout est gardée dans `recentRemovals` (une entrée
 * par article retiré, les expirées effacées au passage) : c'est elle, et non celle du client, que `restoreFavorite`
 * reprend. Renvoie sa place (date d'ajout, rangs dans l'index et dans chaque liste) : « Annuler » la rend à
 * `restoreFavorite` (NEW-8).
 */
export async function removeFavorite(uid: string, id: string): Promise<FavoritePlacement> {
  const db = await adminDb();
  const { FieldValue } = await import("firebase-admin/firestore");
  const userRef = db.doc(`users/${uid}`);
  const favRef = userRef.collection("favorites").doc(id);
  return db.runTransaction(async (tx) => {
    const [user, existing, lists] = await Promise.all([
      tx.get(userRef),
      tx.get(favRef),
      tx.get(userRef.collection("collections").where("articleIds", "array-contains", id)),
    ]);
    const ids = knownFavoriteIds(user) ?? (await favoriteIdsFromDocs(tx, userRef));
    const next = ids.filter((x) => x !== id);
    const removed = existing.exists ? sanitizeSnapshot({ ...existing.data(), id }) : null;
    // Retraits récents : celui-ci (date d'ajout d'origine telle que stockée), et les entrées expirées effacées.
    const removals: Record<string, unknown> = Object.fromEntries(staleRemovals(user.get("recentRemovals")).map((k) => [k, FieldValue.delete()]));
    if (existing.exists) removals[id] = { addedAt: existing.get("addedAt") ?? null, at: FieldValue.serverTimestamp() };
    // L'instantané nettoyé porte toujours tous ses champs : la fusion remplace entièrement celui du retrait précédent.
    tx.set(
      userRef,
      {
        favoriteIds: next,
        favoritesCount: next.length,
        ...(removed ? { lastRemovedFavorite: { snapshot: snapshotForStorage(removed), at: FieldValue.serverTimestamp() } } : {}),
        ...(Object.keys(removals).length > 0 ? { recentRemovals: removals } : {}),
      },
      { merge: true },
    );
    if (existing.exists) tx.delete(favRef);
    lists.docs.forEach((d) => tx.update(d.ref, { articleIds: FieldValue.arrayRemove(id) }));
    const index = ids.indexOf(id);
    return {
      addedAt: existing.exists ? isoFromTimestamp(existing.get("addedAt")) : null,
      index: index >= 0 ? index : null,
      lists: lists.docs.flatMap((d) => {
        const at = stringArray(d.get("articleIds")).indexOf(id);
        return at >= 0 ? [{ id: d.id, index: at }] : [];
      }),
    };
  });
}

const stringArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/**
 * « Annuler » après un retrait (NEW-8), en une transaction : le favori revient avec sa date d'ajout d'origine (celle
 * gardée par le serveur dans `recentRemovals` s'il a été retiré il y a moins de `RESTORE_WINDOW_MS`, sinon celle du
 * serveur ; jamais celle du client) et son rang dans l'index, puis à son rang dans chacune de ses listes qui existe
 * encore. Le tableau `articleIds` est réécrit : un `arrayUnion` le remettrait en dernier. Une liste qui le contient déjà
 * (rangé entre-temps) ou pleine n'est pas touchée. Renvoie le favori et les listes modifiées, avec leur nouvel ordre.
 */
export async function restoreFavorite(
  uid: string,
  s: FavoriteSnapshot,
  verified: boolean,
  placement: FavoritePlacement,
): Promise<{ favorite: Favorite; collections: { id: string; articleIds: string[] }[] }> {
  const db = await adminDb();
  const userRef = db.doc(`users/${uid}`);
  const refs = placement.lists.map((l) => userRef.collection("collections").doc(l.id));
  return db.runTransaction(async (tx) => {
    // Toutes les lectures avant la première écriture (celles d'addFavoriteIn comprises).
    const [user, ...lists] = await tx.getAll(userRef, ...refs);
    // Date d'ajout d'origine : celle que le serveur a gardée au retrait de CET article (moins de RESTORE_WINDOW_MS),
    // même si d'autres ont été retirés depuis (plusieurs toasts « Annuler »). Celle du client n'est jamais reprise : la
    // route ne sert pas d'ajout à date choisie.
    const removal = recentRemoval(user.get("recentRemovals"), s.id);
    const addedAt = await addFavoriteIn(tx, userRef, s, verified, { addedAt: removal.addedAt, index: placement.index });
    // Entrée consommée : un second « Annuler » (ou un rétablissement après un nouvel ajout) ne la reprend plus.
    if (removal.found) {
      const { FieldPath, FieldValue } = await import("firebase-admin/firestore");
      tx.update(userRef, new FieldPath("recentRemovals", s.id), FieldValue.delete());
    }
    const collections = lists.flatMap((list, i) => {
      const current = stringArray(list.get("articleIds"));
      if (!list.exists || current.includes(s.id) || current.length >= MAX_FAVORITES) return [];
      const articleIds = insertAt(current, s.id, placement.lists[i].index);
      tx.update(list.ref, { articleIds });
      return [{ id: list.id, articleIds }];
    });
    return { favorite: favoriteFromSnapshot(s, addedAt), collections };
  });
}
