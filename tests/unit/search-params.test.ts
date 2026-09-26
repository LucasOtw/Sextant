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

  it("ignore un type ou une langue hors liste (la garantie « documents vérifiés » ne se contourne pas par l'URL)", () => {
    expect(parseSearchParams({ type: "preprint" }).type).toBeUndefined();
    expect(parseSearchParams({ type: "article,is_retracted:true" }).type).toBeUndefined();
    expect(parseSearchParams({ type: "book|book-chapter" }).type).toBe("book|book-chapter");
    expect(parseSearchParams({ lang: "xx" }).language).toBeUndefined();
    expect(parseSearchParams({ lang: "en|fr" }).language).toBeUndefined();
    expect(parseSearchParams({ lang: "it" }).language).toBe("it");
  });

  it("n'accepte que des identifiants OpenAlex de la bonne forme (T…, W…, A…), remis en majuscules", () => {
    expect(parseSearchParams({ topic: "t10017", cites: "w2741809807", author: "a5023888391" })).toMatchObject({ topic: "T10017", cites: "W2741809807", author: "A5023888391" });
    for (const bad of ["W2741809807?per-page=1", "W1/../W2", "W1#x", "W2,type:preprint", "", "T", "W12345678901234567"]) {
      const p = parseSearchParams({ topic: bad, cites: bad, author: bad });
      expect([p.topic, p.cites, p.author]).toEqual([undefined, undefined, undefined]);
    }
    // Un identifiant d'un autre type n'est pas accepté à la place d'un autre.
    expect(parseSearchParams({ topic: "W1", cites: "A1", author: "T1" })).toMatchObject({ topic: undefined, cites: undefined, author: undefined });
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
