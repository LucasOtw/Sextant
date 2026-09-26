import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { addFavorite, FavoritesLimitError, listFavoriteIds, listFavorites, RESTORE_WINDOW_MS, removeFavorite, storedSnapshot } from "@/lib/favorites";
import { addToCollection, createCollection, listCollections } from "@/lib/collections";
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
});
