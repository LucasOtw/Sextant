import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { addFavorite, FavoritesLimitError, listFavoriteIds, listFavorites, RESTORE_WINDOW_MS, removeFavorite, restoreFavorite, storedSnapshot } from "@/lib/favorites";
import { addToCollection, createCollection, deleteCollection, listCollections, updateCollection } from "@/lib/collections";
import { MAX_FAVORITES } from "@/lib/favorites-shared";
import { exists, newUid, snap, userDoc } from "./helpers";

describe("favoris (transactions sur émulateur)", () => {
  it("tient favoriteIds et favoritesCount dans la même transaction que l'ajout et le retrait", async () => {
    const uid = newUid();
    await addFavorite(uid, snap(1));
    await addFavorite(uid, snap(2));
    expect(await userDoc(uid)).toMatchObject({ favoriteIds: ["W1", "W2"], favoritesCount: 2 });

    await removeFavorite(uid, "W1");
    expect(await userDoc(uid)).toMatchObject({ favoriteIds: ["W2"], favoritesCount: 1 });
    expect(await exists(`users/${uid}/favorites/W1`)).toBe(false);
  });

  it("date d'ajout posée par le serveur (Timestamp) et conservée quand l'article est réenregistré", async () => {
    const uid = newUid();
    await addFavorite(uid, snap(1));
    const db = await adminDb();
    const first = (await db.doc(`users/${uid}/favorites/W1`).get()).get("addedAt");
    expect(first).toBeInstanceOf(Timestamp);

    const again = await addFavorite(uid, snap(1, { title: "Titre corrigé" }));
    const doc = await db.doc(`users/${uid}/favorites/W1`).get();
    expect((doc.get("addedAt") as Timestamp).isEqual(first)).toBe(true);
    expect(doc.get("title")).toBe("Titre corrigé");
    expect(again.addedAt).toBe((first as Timestamp).toDate().toISOString());
    expect(await userDoc(uid)).toMatchObject({ favoritesCount: 1 });
  });

  it(`refuse le ${MAX_FAVORITES + 1}e favori, mais accepte de rafraîchir un favori existant`, async () => {
    const uid = newUid();
    const ids = Array.from({ length: MAX_FAVORITES }, (_, i) => `W${i + 1}`);
    await (await adminDb()).doc(`users/${uid}`).set({ favoriteIds: ids, favoritesCount: ids.length });

    await expect(addFavorite(uid, snap(MAX_FAVORITES + 1))).rejects.toBeInstanceOf(FavoritesLimitError);
    expect(await exists(`users/${uid}/favorites/W${MAX_FAVORITES + 1}`)).toBe(false);
    expect(await userDoc(uid)).toMatchObject({ favoritesCount: MAX_FAVORITES });

    await expect(addFavorite(uid, snap(1))).resolves.toMatchObject({ id: "W1" });
    expect(await userDoc(uid)).toMatchObject({ favoritesCount: MAX_FAVORITES });
  });

  it("reconstruit l'index depuis la sous-collection quand favoriteIds manque (anciens profils)", async () => {
    const uid = newUid();
    const db = await adminDb();
    await db.doc(`users/${uid}`).set({ email: "ancien@exemple.org" });
    await db.doc(`users/${uid}/favorites/W7`).set({ ...snap(7), addedAt: Timestamp.now() });

    expect(await listFavoriteIds(uid)).toEqual(["W7"]);
    expect(await userDoc(uid)).toMatchObject({ favoriteIds: ["W7"], favoritesCount: 1 });

    await addFavorite(uid, snap(8));
    expect(await userDoc(uid)).toMatchObject({ favoriteIds: ["W7", "W8"], favoritesCount: 2 });
  });

  it("ne recrée pas de profil pour un compte supprimé (lecture de l'index)", async () => {
    const uid = newUid();
    expect(await listFavoriteIds(uid)).toEqual([]);
    expect(await exists(`users/${uid}`)).toBe(false);
  });

  it("retirer un favori le sort de toutes les listes qui le contenaient", async () => {
    const uid = newUid();
    const a = await createCollection(uid, "Lecture");
    const b = await createCollection(uid, "Thèse");
    await addToCollection(uid, a.id, snap(1));
    await addToCollection(uid, a.id, snap(2));
    await addToCollection(uid, b.id, snap(1));

    await removeFavorite(uid, "W1");
    const lists = await listCollections(uid);
    expect(lists.find((l) => l.id === a.id)?.articleIds).toEqual(["W2"]);
    expect(lists.find((l) => l.id === b.id)?.articleIds).toEqual([]);
    expect((await listFavorites(uid)).map((f) => f.id)).toEqual(["W2"]);
  });

  it("ranger un favori inchangé dans des listes n'écrit ni users/{uid} ni le document favori (NEW-9)", async () => {
    const uid = newUid();
    const db = await adminDb();
    const a = await createCollection(uid, "Lecture");
    const b = await createCollection(uid, "Thèse");
    await addFavorite(uid, snap(1));
    const before = await Promise.all([db.doc(`users/${uid}`).get(), db.doc(`users/${uid}/favorites/W1`).get()]);

    await Promise.all([addToCollection(uid, a.id, snap(1)), addToCollection(uid, b.id, snap(1))]);
    const after = await Promise.all([db.doc(`users/${uid}`).get(), db.doc(`users/${uid}/favorites/W1`).get()]);
    expect(after[0].updateTime?.isEqual(before[0].updateTime!)).toBe(true);
    expect(after[1].updateTime?.isEqual(before[1].updateTime!)).toBe(true);
    const lists = await listCollections(uid);
    expect(lists.map((l) => l.articleIds)).toEqual([["W1"], ["W1"]]);

    // Instantané changé chez OpenAlex : le document favori est rafraîchi, l'index reste tel quel.
    await addToCollection(uid, a.id, snap(1, { title: "Titre corrigé" }));
    const fav = await db.doc(`users/${uid}/favorites/W1`).get();
    expect(fav.get("title")).toBe("Titre corrigé");
    expect((await db.doc(`users/${uid}`).get()).updateTime?.isEqual(before[0].updateTime!)).toBe(true);
  });

  it("répare l'index quand le document favori existe sans figurer dans favoriteIds (NEW-9)", async () => {
    const uid = newUid();
    const db = await adminDb();
    await db.doc(`users/${uid}`).set({ favoriteIds: [], favoritesCount: 0 });
    await db.doc(`users/${uid}/favorites/W3`).set({ ...snap(3), addedAt: Timestamp.now() });

    await addFavorite(uid, snap(3));
    expect(await userDoc(uid)).toMatchObject({ favoriteIds: ["W3"], favoritesCount: 1 });
  });

  it("instantané non vérifié (OpenAlex en panne) : jamais par-dessus un favori existant, marqué s'il est nouveau (SEC-06)", async () => {
    const uid = newUid();
    const db = await adminDb();
    await addFavorite(uid, snap(1, { title: "Titre vérifié" }));
    // Rangé dans une liste pendant une panne, avec les métadonnées d'une liste partagée.
    await addToCollection(uid, (await createCollection(uid, "Thèse")).id, snap(1, { title: "Titre du client" }), false);
    await addFavorite(uid, snap(1, { title: "Titre du client" }), false);
    const kept = await db.doc(`users/${uid}/favorites/W1`).get();
    expect(kept.get("title")).toBe("Titre vérifié");
    expect(kept.get("unverified")).toBeUndefined();

    // Nouveau favori pendant la panne : écrit, marqué ; un ajout vérifié ensuite le remplace et retire la marque.
    await addFavorite(uid, snap(2, { title: "Titre du client" }), false);
    expect((await db.doc(`users/${uid}/favorites/W2`).get()).get("unverified")).toBe(true);
    await addFavorite(uid, snap(2, { title: "Titre du client" }));
    const verified = await db.doc(`users/${uid}/favorites/W2`).get();
    expect(verified.get("unverified")).toBeUndefined();
    expect(await userDoc(uid)).toMatchObject({ favoriteIds: ["W1", "W2"], favoritesCount: 2 });
  });

  it("storedSnapshot : favori stocké, ou dernier retiré depuis moins de 10 minutes (« Annuler »)", async () => {
    const uid = newUid();
    const db = await adminDb();
    await addFavorite(uid, snap(1, { title: "Gardé" }));
    await addFavorite(uid, snap(2, { title: "Retiré" }));
    expect(await storedSnapshot(uid, "W1")).toMatchObject({ id: "W1", title: "Gardé" });
    expect(await storedSnapshot(uid, "W9")).toBeNull();

    await removeFavorite(uid, "W2");
    expect(await storedSnapshot(uid, "W2")).toMatchObject({ id: "W2", title: "Retiré" });
    // Rétabli : le document favori est réécrit tel qu'il était.
    await addFavorite(uid, (await storedSnapshot(uid, "W2"))!, false);
    expect((await db.doc(`users/${uid}/favorites/W2`).get()).get("title")).toBe("Retiré");

    // Au-delà du délai : plus rien à rétablir.
    await removeFavorite(uid, "W2");
    await db.doc(`users/${uid}`).update({ "lastRemovedFavorite.at": Timestamp.fromMillis(Date.now() - RESTORE_WINDOW_MS - 1_000) });
    expect(await storedSnapshot(uid, "W2")).toBeNull();
  });

  it("volume et pages (QUAL-02) : un rafraîchissement remplace tout le biblio, un retrait n'en laisse rien d'ancien", async () => {
    const uid = newUid();
    const db = await adminDb();
    const ref = db.doc(`users/${uid}/favorites/W1`);
    await addFavorite(uid, snap(1, { biblio: { volume: "6", issue: "2", firstPage: "10", lastPage: "20" } }));
    expect((await ref.get()).get("biblio")).toEqual({ volume: "6", issue: "2", firstPage: "10", lastPage: "20" });

    // Notice corrigée chez OpenAlex : plus de numéro ni de dernière page. La fusion ne garde pas les anciennes valeurs.
    await addFavorite(uid, snap(1, { biblio: { volume: "7", issue: null, firstPage: "e1", lastPage: null } }));
    expect((await ref.get()).get("biblio")).toEqual({ volume: "7", issue: null, firstPage: "e1", lastPage: null });
    expect((await listFavorites(uid))[0].biblio).toEqual({ volume: "7", issue: null, firstPage: "e1", lastPage: null });

    // Plus de biblio du tout : null écrit, relu comme absent.
    await addFavorite(uid, snap(1));
    expect((await ref.get()).get("biblio")).toBeNull();
    expect((await listFavorites(uid))[0]).not.toHaveProperty("biblio");

    // Retrait d'un favori avec biblio, puis d'un favori sans : le second « Annuler » ne reprend pas le biblio du premier.
    await addFavorite(uid, snap(2, { biblio: { volume: "9", issue: "1", firstPage: "1", lastPage: "5" } }));
    await removeFavorite(uid, "W2");
    expect((await storedSnapshot(uid, "W2"))?.biblio).toEqual({ volume: "9", issue: "1", firstPage: "1", lastPage: "5" });
    await removeFavorite(uid, "W1");
    expect(await storedSnapshot(uid, "W1")).not.toHaveProperty("biblio");
  });

  it("« Annuler » un retrait (NEW-8) : date d'ajout, rang dans l'index et rang dans chaque liste rétablis", async () => {
    const uid = newUid();
    const db = await adminDb();
    const a = await createCollection(uid, "Lecture");
    const b = await createCollection(uid, "Thèse");
    for (const n of [1, 2, 3]) await addToCollection(uid, a.id, snap(n));
    await addToCollection(uid, b.id, snap(3));
    await addToCollection(uid, b.id, snap(2));
    // Ordre manuel : W2 en tête de la liste a.
    await updateCollection(uid, a.id, { articleIds: ["W2", "W1", "W3"] });
    const before = (await db.doc(`users/${uid}/favorites/W2`).get()).get("addedAt") as Timestamp;

    const placement = await removeFavorite(uid, "W2");
    expect(placement).toEqual({ addedAt: before.toDate().toISOString(), index: 1, lists: expect.arrayContaining([{ id: a.id, index: 0 }, { id: b.id, index: 1 }]) });
    expect(placement.lists).toHaveLength(2);

    const out = await restoreFavorite(uid, snap(2), true, placement);
    expect(out.favorite.addedAt).toBe(before.toDate().toISOString());
    expect(out.collections).toEqual(expect.arrayContaining([{ id: a.id, articleIds: ["W2", "W1", "W3"] }, { id: b.id, articleIds: ["W3", "W2"] }]));
    const after = (await db.doc(`users/${uid}/favorites/W2`).get()).get("addedAt") as Timestamp;
    expect(after.toMillis()).toBe(before.toMillis());
    expect(await userDoc(uid)).toMatchObject({ favoriteIds: ["W1", "W2", "W3"], favoritesCount: 3 });
    const lists = await listCollections(uid);
    expect(lists.find((l) => l.id === a.id)?.articleIds).toEqual(["W2", "W1", "W3"]);
    expect(lists.find((l) => l.id === b.id)?.articleIds).toEqual(["W3", "W2"]);
  });

  it("« Annuler » : une liste supprimée entre-temps est ignorée, une liste qui le contient déjà n'est pas réécrite", async () => {
    const uid = newUid();
    const a = await createCollection(uid, "Lecture");
    const b = await createCollection(uid, "Thèse");
    await addToCollection(uid, a.id, snap(1));
    await addToCollection(uid, a.id, snap(2));
    await addToCollection(uid, b.id, snap(1));
    const placement = await removeFavorite(uid, "W1");
    await deleteCollection(uid, b.id);
    // Rangé de nouveau dans a (en dernier) avant « Annuler » : sa place actuelle est gardée.
    await addToCollection(uid, a.id, snap(1));

    const out = await restoreFavorite(uid, snap(1), true, placement);
    expect(out.collections).toEqual([]);
    expect((await listCollections(uid)).map((l) => [l.id, l.articleIds])).toEqual([[a.id, ["W2", "W1"]]]);
    expect(await exists(`users/${uid}/collections/${b.id}`)).toBe(false);
    expect(await userDoc(uid)).toMatchObject({ favoriteIds: ["W2", "W1"], favoritesCount: 2 });
  });

  it("« Annuler » : date d'ajout fournie ignorée pour un article qui n'a pas été retiré à l'instant (date du serveur)", async () => {
    const uid = newUid();
    const db = await adminDb();
    const old = "1970-01-01T00:00:00.000Z";
    // Jamais retiré : la route ne sert pas d'ajout à date choisie.
    const never = await restoreFavorite(uid, snap(1), true, { addedAt: old, index: null, lists: [] });
    expect(never.favorite.addedAt).not.toBe(old);
    expect(((await db.doc(`users/${uid}/favorites/W1`).get()).get("addedAt") as Timestamp).toMillis()).toBeGreaterThan(0);
    // Un autre article vient d'être retiré : la date n'est pas reprise pour celui-ci.
    await addFavorite(uid, snap(3));
    await removeFavorite(uid, "W3");
    const other = await restoreFavorite(uid, snap(2), true, { addedAt: old, index: null, lists: [] });
    expect(other.favorite.addedAt).not.toBe(old);
    // Retrait trop ancien (au-delà de RESTORE_WINDOW_MS) : date du serveur aussi.
    await addFavorite(uid, snap(4));
    await db.doc(`users/${uid}/favorites/W4`).update({ addedAt: Timestamp.fromDate(new Date("2025-01-02T03:04:05.000Z")) });
    await removeFavorite(uid, "W4");
    await db.doc(`users/${uid}`).update({ "recentRemovals.W4.at": Timestamp.fromMillis(Date.now() - RESTORE_WINDOW_MS - 60_000) });
    const late = await restoreFavorite(uid, snap(4), true, { addedAt: "2025-01-02T03:04:05.000Z", index: null, lists: [] });
    expect(late.favorite.addedAt).not.toBe("2025-01-02T03:04:05.000Z");
    // Retiré à l'instant : la date d'origine gardée par le serveur est reprise, pas celle envoyée par le client.
    await addFavorite(uid, snap(5));
    await db.doc(`users/${uid}/favorites/W5`).update({ addedAt: Timestamp.fromDate(new Date("2025-01-02T03:04:05.000Z")) });
    await removeFavorite(uid, "W5");
    const back = await restoreFavorite(uid, snap(5), true, { addedAt: old, index: null, lists: [] });
    expect(back.favorite.addedAt).toBe("2025-01-02T03:04:05.000Z");
    // Entrée consommée par le rétablissement : elle ne sert plus.
    expect((await userDoc(uid))?.recentRemovals).not.toHaveProperty("W5");
  });

  it("« Annuler » sur plusieurs retraits : retirer W1 puis W2, rétablir W1 garde sa date d'origine", async () => {
    const uid = newUid();
    const db = await adminDb();
    const w1 = "2025-03-04T05:06:07.000Z";
    const w2 = "2025-06-07T08:09:10.000Z";
    await addFavorite(uid, snap(1));
    await addFavorite(uid, snap(2));
    await db.doc(`users/${uid}/favorites/W1`).update({ addedAt: Timestamp.fromDate(new Date(w1)) });
    await db.doc(`users/${uid}/favorites/W2`).update({ addedAt: Timestamp.fromDate(new Date(w2)) });

    const p1 = await removeFavorite(uid, "W1");
    const p2 = await removeFavorite(uid, "W2");
    // Deux toasts : « Annuler » sur le premier retrait, alors que lastRemovedFavorite porte W2.
    const one = await restoreFavorite(uid, snap(1), true, p1);
    expect(one.favorite.addedAt).toBe(w1);
    expect(((await db.doc(`users/${uid}/favorites/W1`).get()).get("addedAt") as Timestamp).toDate().toISOString()).toBe(w1);
    const two = await restoreFavorite(uid, snap(2), true, p2);
    expect(two.favorite.addedAt).toBe(w2);
    expect(await userDoc(uid)).toMatchObject({ favoriteIds: expect.arrayContaining(["W1", "W2"]), favoritesCount: 2 });
    expect(Object.keys(((await userDoc(uid))?.recentRemovals ?? {}) as object)).toEqual([]);
  });

  it("retraits récents : les entrées de plus de RESTORE_WINDOW_MS sont effacées au retrait suivant", async () => {
    const uid = newUid();
    const db = await adminDb();
    await addFavorite(uid, snap(1));
    await addFavorite(uid, snap(2));
    await removeFavorite(uid, "W1");
    await db.doc(`users/${uid}`).update({ "recentRemovals.W1.at": Timestamp.fromMillis(Date.now() - RESTORE_WINDOW_MS - 1_000) });
    await removeFavorite(uid, "W2");
    expect(Object.keys(((await userDoc(uid))?.recentRemovals ?? {}) as object)).toEqual(["W2"]);
  });

  it("« Annuler » sans date connue : date posée par le serveur, en dernier dans l'index", async () => {
    const uid = newUid();
    await addFavorite(uid, snap(1));
    const out = await restoreFavorite(uid, snap(2), true, { addedAt: null, index: null, lists: [] });
    const stored = (await (await adminDb()).doc(`users/${uid}/favorites/W2`).get()).get("addedAt");
    expect(stored).toBeInstanceOf(Timestamp);
    expect(out.favorite.addedAt).not.toBeNull();
    expect(await userDoc(uid)).toMatchObject({ favoriteIds: ["W1", "W2"], favoritesCount: 2 });
  });
});
