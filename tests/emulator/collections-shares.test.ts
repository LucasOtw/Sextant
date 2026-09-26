import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import {
  addToCollection,
  CollectionNotFoundError,
  CollectionOrderError,
  CollectionsLimitError,
  createCollection,
  deleteCollection,
  listCollections,
  removeFromCollection,
  updateCollection,
} from "@/lib/collections";
import { MAX_COLLECTIONS } from "@/lib/collections-shared";
import { createShare, getSharedList, revokeShare } from "@/lib/shares";
import { exists, newUid, snap, userDoc } from "./helpers";

describe("listes (transactions sur émulateur)", () => {
  it("createdAt posé par le serveur, ordre de création conservé", async () => {
    const uid = newUid();
    const a = await createCollection(uid, "Première");
    await createCollection(uid, "Seconde");
    const stored = (await (await adminDb()).doc(`users/${uid}/collections/${a.id}`).get()).get("createdAt");
    expect(stored).toBeInstanceOf(Timestamp);
    expect((await listCollections(uid)).map((l) => l.name)).toEqual(["Première", "Seconde"]);
  });

  it(`refuse la ${MAX_COLLECTIONS + 1}e liste`, async () => {
    const uid = newUid();
    const db = await adminDb();
    const batch = db.batch();
    for (let i = 0; i < MAX_COLLECTIONS; i++) batch.set(db.collection(`users/${uid}/collections`).doc(), { name: `L${i}`, articleIds: [], createdAt: Timestamp.now() });
    await batch.commit();
    await expect(createCollection(uid, "De trop")).rejects.toBeInstanceOf(CollectionsLimitError);
  });

  it("ajouter à une liste enregistre aussi le favori (tout ou rien)", async () => {
    const uid = newUid();
    const list = await createCollection(uid, "Lecture");
    const { collection, favorite } = await addToCollection(uid, list.id, snap(1));
    expect(collection.articleIds).toEqual(["W1"]);
    expect(favorite.id).toBe("W1");
    expect(await userDoc(uid)).toMatchObject({ favoriteIds: ["W1"], favoritesCount: 1 });

    // Liste introuvable : ni favori ni index modifiés.
    await expect(addToCollection(uid, "absente", snap(2))).rejects.toBeInstanceOf(CollectionNotFoundError);
    expect(await exists(`users/${uid}/favorites/W2`)).toBe(false);
    expect(await userDoc(uid)).toMatchObject({ favoritesCount: 1 });
  });

  it("réordonne seulement si l'ordre proposé contient exactement les articles actuels (CollectionOrderError)", async () => {
    const uid = newUid();
    const list = await createCollection(uid, "Lecture");
    for (const n of [1, 2, 3]) await addToCollection(uid, list.id, snap(n));

    expect((await updateCollection(uid, list.id, { articleIds: ["W3", "W1", "W2"] })).articleIds).toEqual(["W3", "W1", "W2"]);
    await expect(updateCollection(uid, list.id, { articleIds: ["W3", "W1"] })).rejects.toBeInstanceOf(CollectionOrderError);
    await expect(updateCollection(uid, list.id, { articleIds: ["W3", "W1", "W1"] })).rejects.toBeInstanceOf(CollectionOrderError);
    await expect(updateCollection(uid, list.id, { articleIds: ["W3", "W1", "W9"] })).rejects.toBeInstanceOf(CollectionOrderError);
    // Un ordre refusé ne modifie rien, pas même le nom demandé dans le même appel.
    await expect(updateCollection(uid, list.id, { name: "Renommée", articleIds: ["W1"] })).rejects.toBeInstanceOf(CollectionOrderError);
    const [stored] = await listCollections(uid);
    expect(stored).toMatchObject({ name: "Lecture", articleIds: ["W3", "W1", "W2"] });

    // Retirer d'une liste laisse l'article en favori.
    await removeFromCollection(uid, list.id, "W1");
    expect((await listCollections(uid))[0].articleIds).toEqual(["W3", "W2"]);
    expect(await exists(`users/${uid}/favorites/W1`)).toBe(true);
  });
});

describe("partage d'une liste (transactions sur émulateur)", () => {
  it("un seul lien par liste ; la page publique ne voit ni la date d'ajout ni l'auteur", async () => {
    const uid = newUid();
    const list = await createCollection(uid, "Publique", "Pour le séminaire");
    await addToCollection(uid, list.id, snap(1));
    await addToCollection(uid, list.id, snap(2));
    await updateCollection(uid, list.id, { articleIds: ["W2", "W1"] });

    const token = await createShare(uid, list.id);
    expect(await createShare(uid, list.id)).toBe(token);
    expect(await exists(`shares/${token}`)).toBe(true);

    const shared = await getSharedList(token);
    expect(shared).toMatchObject({ name: "Publique", description: "Pour le séminaire" });
    expect(shared?.articles.map((a) => a.id)).toEqual(["W2", "W1"]);
    for (const a of shared?.articles ?? []) expect(a).not.toHaveProperty("addedAt");
    expect(JSON.stringify(shared)).not.toContain(uid);
  });

  it("révoquer efface le lien et la page publique ne répond plus", async () => {
    const uid = newUid();
    const list = await createCollection(uid, "Temporaire");
    const token = await createShare(uid, list.id);

    await revokeShare(uid, list.id);
    expect(await exists(`shares/${token}`)).toBe(false);
    expect(await getSharedList(token)).toBeNull();
    expect((await listCollections(uid))[0].shareToken).toBeNull();

    // Un nouveau partage produit un nouveau jeton : l'ancien lien reste mort.
    const next = await createShare(uid, list.id);
    expect(next).not.toBe(token);
    expect(await getSharedList(token)).toBeNull();
  });

  it("un jeton qui ne correspond plus à la liste (double vérification) est refusé", async () => {
    const uid = newUid();
    const list = await createCollection(uid, "Liste");
    const token = await createShare(uid, list.id);
    await (await adminDb()).doc(`users/${uid}/collections/${list.id}`).update({ shareToken: "autre-jeton" });
    expect(await getSharedList(token)).toBeNull();
  });

  it("supprimer une liste partagée supprime son lien", async () => {
    const uid = newUid();
    const list = await createCollection(uid, "Éphémère");
    const token = await createShare(uid, list.id);
    await deleteCollection(uid, list.id);
    expect(await exists(`users/${uid}/collections/${list.id}`)).toBe(false);
    expect(await exists(`shares/${token}`)).toBe(false);
    await expect(createShare(uid, list.id)).rejects.toBeInstanceOf(CollectionNotFoundError);
  });
});
