import { describe, expect, it } from "vitest";
import { buildHref, parseSearchParams } from "@/lib/search-params";

describe("parseSearchParams", () => {
  it("valeurs par défaut : page 1, pertinence, revues indexées", () => {
    expect(parseSearchParams({})).toEqual({
      q: undefined,
      page: 1,
      perPage: 20,
      sort: "relevance",
      type: undefined,
      oaOnly: false,
      yearFrom: undefined,
      yearTo: undefined,
      topic: undefined,
      cites: undefined,
      language: undefined,
      coreOnly: true,
      author: undefined,
    });
  });

  it("lit chaque filtre et garde la première valeur d'un paramètre répété", () => {
    const p = parseSearchParams({ q: ["climat", "autre"], page: "3", sort: "cited", type: "review", oa: "1", from: "2019", to: "2024", topic: "T1", cites: "W2", lang: "fr", src: "any", author: "A5" });
    expect(p).toMatchObject({ q: "climat", page: 3, sort: "cited", type: "review", oaOnly: true, yearFrom: 2019, yearTo: 2024, topic: "T1", cites: "W2", language: "fr", coreOnly: false, author: "A5" });
  });

  it("assainit les valeurs hors domaine", () => {
    expect(parseSearchParams({ page: "-4" }).page).toBe(1);
    expect(parseSearchParams({ page: "abc" }).page).toBe(1);
    expect(parseSearchParams({ sort: "cited_by_count:desc" }).sort).toBe("relevance");
    expect(parseSearchParams({ oa: "true" }).oaOnly).toBe(false);
    expect(parseSearchParams({ from: "vingt" }).yearFrom).toBeUndefined();
  });

  it("les valeurs imposées par la page (thème) l'emportent", () => {
    expect(parseSearchParams({ q: "x" }, { field: "17", perPage: 10 })).toMatchObject({ q: "x", field: "17", perPage: 10 });
  });
});

describe("buildHref", () => {
  it("reprend les paramètres, applique le correctif et retire les valeurs vides", () => {
    expect(buildHref("/search", { q: "climat", page: "2", oa: "" }, { page: undefined, sort: "recent" })).toBe("/search?q=climat&sort=recent");
    expect(buildHref("/search", { q: ["a b", "c"] }, { page: 3 })).toBe("/search?q=a+b&page=3");
  });

  it("sans paramètre, l'adresse de base seule", () => {
    expect(buildHref("/theme/informatique", {}, { page: undefined })).toBe("/theme/informatique");
  });
});
