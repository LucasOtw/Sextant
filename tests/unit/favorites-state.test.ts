import { describe, expect, it } from "vitest";
import { EMPTY_FAVORITES, favoritesReducer, listsContaining, membershipIndex, placementOf, type FavoritesAction, type FavoritesState } from "@/components/favorites/favorites-state";
import type { Collection } from "@/lib/collections-shared";
import { makeSnapshot } from "../fixtures";

const AT = "2026-09-26T10:00:00.000Z";
const list = (id: string, articleIds: string[], extra: Partial<Collection> = {}): Collection => ({ id, name: `Liste ${id}`, description: "", articleIds, createdAt: null, shareToken: null, ...extra });
const run = (state: FavoritesState, ...actions: FavoritesAction[]) => actions.reduce(favoritesReducer, state);

const W1 = makeSnapshot({ id: "W1" });
const W2 = makeSnapshot({ id: "W2" });
/** Deux favoris, W1 rangé dans deux listes sur trois. */
const base = run(EMPTY_FAVORITES, { type: "loaded", ids: ["W1", "W2"], collections: [list("a", ["W1", "W2"]), list("b", ["W1"]), list("c", ["W2"])] });

describe("état des favoris (reducer, QUAL-12)", () => {
  it("chargement : identifiants et listes ; une réponse identique garde le même état (aucun rendu, PERF-12)", () => {
    expect([...base.ids]).toEqual(["W1", "W2"]);
    expect(base.collectionsLoaded).toBe(true);
    expect(run(base, { type: "loaded", ids: ["W2", "W1"], collections: [list("a", ["W1", "W2"]), list("b", ["W1"]), list("c", ["W2"])] })).toBe(base);
    // Listes en échec (null) ou non demandées : celles qu'on a restent.
    expect(run(base, { type: "loaded", ids: ["W1", "W2"], collections: null })).toBe(base);
    expect(run(base, { type: "loaded", ids: ["W1", "W2"] })).toBe(base);
  });

  it("bascule puis retour arrière : l'état revient à l'identique", () => {
    const added = run(base, { type: "toggled", snapshot: makeSnapshot({ id: "W3" }), favorite: true, memberships: [], at: AT });
    expect(added.ids.has("W3")).toBe(true);
    expect(added.added.get("W3")).toMatchObject({ id: "W3", addedAt: AT });
    const reverted = run(added, { type: "toggleReverted", snapshot: makeSnapshot({ id: "W3" }), wasFavorite: false, memberships: [], previous: { ...W1, addedAt: null } });
    expect(reverted.ids).toEqual(base.ids);
    expect(reverted.added.size).toBe(0);
  });

  it("retirer un favori le sort de ses listes ; le retour arrière l'y remet, et lui seul", () => {
    const memberships = listsContaining(base.collections, "W1");
    expect(memberships).toEqual(["a", "b"]);
    const removed = run(base, { type: "toggled", snapshot: W1, favorite: false, memberships, at: AT });
    expect(removed.ids.has("W1")).toBe(false);
    expect(removed.collections.map((c) => c.articleIds)).toEqual([["W2"], [], ["W2"]]);
    // La liste c ne contenait pas W1 : elle garde son objet.
    expect(removed.collections[2]).toBe(base.collections[2]);
    const back = run(removed, { type: "toggleReverted", snapshot: W1, wasFavorite: true, memberships, previous: { ...W1, addedAt: AT } });
    expect(back.ids.has("W1")).toBe(true);
    expect(back.added.get("W1")).toEqual({ ...W1, addedAt: AT });
    expect(back.collections.map((c) => [...c.articleIds].sort())).toEqual([["W1", "W2"], ["W1"], ["W2"]]);
  });

  it("ajouter à une liste enregistre en favori ; le retour arrière défait les deux", () => {
    const W3 = makeSnapshot({ id: "W3" });
    const inList = run(base, { type: "listMembership", listId: "c", snapshot: W3, inList: true, markFavorite: true, at: AT });
    expect(inList.collections.find((c) => c.id === "c")?.articleIds).toEqual(["W2", "W3"]);
    expect(inList.ids.has("W3")).toBe(true);
    expect(inList.added.get("W3")).toMatchObject({ id: "W3", addedAt: AT });
    const back = run(inList, { type: "listMembershipReverted", listId: "c", snapshot: W3, wasIn: false, unmarkFavorite: true });
    expect(back.collections.find((c) => c.id === "c")?.articleIds).toEqual(["W2"]);
    expect(back.ids.has("W3")).toBe(false);
    expect(back.added.has("W3")).toBe(false);
  });

  it("retirer d'une liste un favori : il reste en favori", () => {
    const out = run(base, { type: "listMembership", listId: "a", snapshot: W2, inList: false, markFavorite: false, at: AT });
    expect(out.collections[0].articleIds).toEqual(["W1"]);
    expect(out.ids).toBe(base.ids);
  });

  it("retour arrière ciblé d'un renommage : un ajout fait entre-temps dans la même liste reste", () => {
    const renamed = run(base, { type: "collectionPatched", id: "b", patch: { name: "Thèse" } });
    const withW2 = run(renamed, { type: "listMembership", listId: "b", snapshot: W2, inList: true, markFavorite: false, at: AT });
    const back = run(withW2, { type: "collectionPatched", id: "b", patch: { name: "Liste b" } });
    expect(back.collections[1]).toMatchObject({ name: "Liste b", articleIds: ["W1", "W2"] });
  });

  it("suppression annulée : la liste revient à sa place, sans défaire un ajout dans une autre", () => {
    const removed = run(base, { type: "collectionRemoved", id: "b" });
    expect(removed.collections.map((c) => c.id)).toEqual(["a", "c"]);
    const other = run(removed, { type: "listMembership", listId: "c", snapshot: W1, inList: true, markFavorite: false, at: AT });
    const back = run(other, { type: "collectionRestored", collection: base.collections[1], index: 1 });
    expect(back.collections.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(back.collections[2].articleIds).toEqual(["W2", "W1"]);
    // Déjà revenue : rien à faire.
    expect(run(back, { type: "collectionRestored", collection: base.collections[1], index: 1 })).toBe(back);
  });

  it("création, partage, déconnexion", () => {
    const created = run(base, { type: "collectionCreated", collection: list("d", []) });
    expect(created.collections.map((c) => c.id)).toEqual(["a", "b", "c", "d"]);
    expect(run(created, { type: "collectionCreated", collection: list("d", []) })).toBe(created);
    const shared = run(created, { type: "shareToken", id: "d", token: "tok" });
    expect(shared.collections[3].shareToken).toBe("tok");
    expect(run(shared, { type: "shareToken", id: "d", token: "tok" })).toBe(shared);
    expect(run(shared, { type: "reset" })).toBe(EMPTY_FAVORITES);
    expect(run(EMPTY_FAVORITES, { type: "reset" })).toBe(EMPTY_FAVORITES);
  });

  it("graine de listes : seulement si rien n'est encore connu ; « périmées » après un changement de compte", () => {
    const seeded = run(EMPTY_FAVORITES, { type: "listsSeeded", collections: [list("a", [])] });
    expect(seeded.collections).toHaveLength(1);
    expect(seeded.collectionsLoaded).toBe(false);
    expect(run(base, { type: "listsSeeded", collections: [] })).toBe(base);
    expect(run(base, { type: "listsStale" }).collectionsLoaded).toBe(false);
  });

  it("index article → listes", () => {
    const m = membershipIndex(base.collections);
    expect(m.get("W1")?.map((c) => c.id)).toEqual(["a", "b"]);
    expect(m.get("W2")?.map((c) => c.id)).toEqual(["a", "c"]);
    expect(m.has("W9")).toBe(false);
  });

  it("« Annuler » un retrait (NEW-8) : le favori revient à son rang dans l'index et dans chacune de ses listes", () => {
    // W2 en tête de la liste a, avant W1 : retiré puis rétabli, il retrouve la première place, pas la dernière.
    const start = run(EMPTY_FAVORITES, { type: "loaded", ids: ["W1", "W2", "W3"], collections: [list("a", ["W2", "W1"]), list("b", ["W3"]), list("c", ["W1", "W2", "W3"])] });
    const placement = placementOf(start, "W2");
    expect(placement).toEqual({ addedAt: null, index: 1, lists: [{ id: "a", index: 0 }, { id: "c", index: 1 }] });
    const removed = run(start, { type: "toggled", snapshot: W2, favorite: false, memberships: listsContaining(start.collections, "W2"), at: AT });
    const restored = run(removed, { type: "favoriteRestored", snapshot: W2, placement: { ...placement, addedAt: "2025-01-02T03:04:05.000Z" }, at: AT });
    expect([...restored.ids]).toEqual(["W1", "W2", "W3"]);
    expect(restored.collections.map((c) => c.articleIds)).toEqual([["W2", "W1"], ["W3"], ["W1", "W2", "W3"]]);
    // La liste b n'est pas touchée ; la date d'ajout d'origine est gardée.
    expect(restored.collections[1]).toBe(removed.collections[1]);
    expect(restored.added.get("W2")?.addedAt).toBe("2025-01-02T03:04:05.000Z");
    // Date inconnue du client : celle du rétablissement, en attendant la réponse du serveur.
    expect(run(removed, { type: "favoriteRestored", snapshot: W2, placement, at: AT }).added.get("W2")?.addedAt).toBe(AT);
  });

  it("« Annuler » : une liste qui contient déjà l'article (rangé entre-temps) ou disparue n'est pas touchée", () => {
    const again = run(base, { type: "favoriteRestored", snapshot: W1, placement: { addedAt: null, index: 0, lists: [{ id: "a", index: 1 }, { id: "zz", index: 0 }] }, at: AT });
    expect(again.ids).toBe(base.ids);
    expect(again.collections).toBe(base.collections);
  });
});
