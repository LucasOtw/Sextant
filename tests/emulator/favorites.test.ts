import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { addFavorite, FavoritesLimitError, listFavoriteIds, listFavorites, removeFavorite } from "@/lib/favorites";
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
});
