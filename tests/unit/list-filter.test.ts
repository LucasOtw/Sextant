import { describe, expect, it } from "vitest";
import { countDistinct, filterFolded, fold, foldedIndex, groupBy, nextPage, PAGE_SIZE, visibleCount } from "@/lib/list-filter";
import { sameIdSet, sameSnapshot } from "@/lib/favorites-shared";
import { sameCollections, type Collection } from "@/lib/collections-shared";
import { makeSnapshot } from "../fixtures";

const items = [
  { id: "a", text: "Écologie des forêts", workId: "W1" },
  { id: "b", text: "Économie circulaire", workId: "W2" },
  { id: "c", text: "Forêt boréale et climat", workId: "W1" },
];

describe("filtre des grandes listes (PERF-11)", () => {
  it("plie accents et casse", () => {
    expect(fold("Écologie ÇA Forêt")).toBe("ecologie ca foret");
  });

  it("filtre sur l'index plié, requête pliée et rognée ; tout si elle est vide", () => {
    const index = foldedIndex(items, (h) => h.text);
    expect(filterFolded(items, index, "  FORET ").map((h) => h.id)).toEqual(["a", "c"]);
    expect(filterFolded(items, index, "économie").map((h) => h.id)).toEqual(["b"]);
    expect(filterFolded(items, index, "   ")).toEqual(items);
    expect(filterFolded(items, index, "introuvable")).toEqual([]);
  });

  it("un élément absent de l'index (ajouté après son calcul) n'est pas retenu par un filtre", () => {
    const index = foldedIndex(items.slice(0, 1), (h) => h.text);
    expect(filterFolded(items, index, "foret").map((h) => h.id)).toEqual(["a"]);
  });

  it("groupe par article dans l'ordre de première apparition et compte les articles", () => {
    expect(groupBy(items, (h) => h.workId).map((g) => g.map((h) => h.id))).toEqual([["a", "c"], ["b"]]);
    expect(countDistinct(items, (h) => h.workId)).toBe(2);
  });

  it("tranche : PAGE_SIZE au départ, +PAGE_SIZE par « Afficher plus », remise à zéro quand filtre, liste ou tri changent", () => {
    let page = { key: "", n: PAGE_SIZE };
    expect(visibleCount(page, "q|liste|added")).toBe(PAGE_SIZE);
    page = nextPage(page, "q|liste|added");
    expect(visibleCount(page, "q|liste|added")).toBe(2 * PAGE_SIZE);
    page = nextPage(page, "q|liste|added");
    expect(visibleCount(page, "q|liste|added")).toBe(3 * PAGE_SIZE);
    expect(visibleCount(page, "q2|liste|added")).toBe(PAGE_SIZE);
    expect(nextPage(page, "q2|liste|added")).toEqual({ key: "q2|liste|added", n: 2 * PAGE_SIZE });
  });
});

describe("rechargements sans changement (PERF-12)", () => {
  it("même ensemble d'identifiants, ordre indifférent", () => {
    expect(sameIdSet(new Set(["W1", "W2"]), ["W2", "W1"])).toBe(true);
    expect(sameIdSet(new Set(["W1", "W2"]), ["W1"])).toBe(false);
    expect(sameIdSet(new Set(["W1", "W2"]), ["W1", "W3"])).toBe(false);
    expect(sameIdSet(new Set(), [])).toBe(true);
  });

  const list = (overrides: Partial<Collection> = {}): Collection => ({ id: "c1", name: "Thèse", description: "", articleIds: ["W1", "W2"], createdAt: "2026-09-01T00:00:00.000Z", shareToken: null, ...overrides });

  it("mêmes listes, champ par champ et articles dans l'ordre", () => {
    expect(sameCollections([list()], [list()])).toBe(true);
    expect(sameCollections([list()], [list({ articleIds: ["W2", "W1"] })])).toBe(false);
    expect(sameCollections([list()], [list({ name: "Mémoire" })])).toBe(false);
    expect(sameCollections([list()], [list({ description: "À lire" })])).toBe(false);
    expect(sameCollections([list()], [list({ shareToken: "a".repeat(22) })])).toBe(false);
    expect(sameCollections([list()], [list(), list({ id: "c2" })])).toBe(false);
    expect(sameCollections([], [])).toBe(true);
  });
});

describe("instantané inchangé : pas de réécriture du favori (NEW-9)", () => {
  const s = makeSnapshot();

  it("reconnaît l'instantané stocké, champs en plus (addedAt) ignorés", () => {
    expect(sameSnapshot({ ...s, addedAt: { seconds: 1 } }, s)).toBe(true);
  });

  it("détecte un champ changé, absent, ou une liste d'auteurs différente", () => {
    expect(sameSnapshot({ ...s, title: "Autre titre" }, s)).toBe(false);
    expect(sameSnapshot({ ...s, citedByCount: 1201 }, s)).toBe(false);
    const withoutTopic: Record<string, unknown> = { ...s };
    delete withoutTopic.topic;
    expect(sameSnapshot(withoutTopic, s)).toBe(false);
    expect(sameSnapshot({ ...s, authorNames: ["Heather Piwowar"] }, s)).toBe(false);
    expect(sameSnapshot({ ...s, authorNames: "Heather Piwowar" }, s)).toBe(false);
    expect(sameSnapshot(undefined, s)).toBe(false);
  });
});
