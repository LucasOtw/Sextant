import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuthorProfile, getQualityWorksByIds, getRecentByTopic, getSeedMeta, getSimilarWorks, getTopic, getWork, OpenAlexError } from "@/lib/openalex";

/**
 * Faux OpenAlex : les lectures par identifiants renvoient les identifiants connus (dans le désordre), les lectures par
 * sujet renvoient `topicResults`. Chaque adresse appelée est gardée pour vérifier les filtres.
 */
function fakeOpenAlex({ known = [] as string[], topicResults = [] as string[], status = 200 } = {}) {
  const calls: URL[] = [];
  vi.stubGlobal("fetch", async (url: URL) => {
    calls.push(url);
    if (status !== 200) return new Response("{}", { status });
    const filter = url.searchParams.get("filter") ?? "";
    const ids = /ids\.openalex:([^,]+)/.exec(filter)?.[1].split("|");
    const results = ids ? known.filter((id) => ids.includes(id)).reverse() : topicResults;
    return Response.json({ meta: { count: results.length }, results: results.map((id) => ({ id: `https://openalex.org/${id}` })) });
  });
  return calls;
}

const filtersOf = (u: URL) => (u.searchParams.get("filter") ?? "").split(",");
const ids = (works: { id: string }[]) => works.map((w) => w.id.replace("https://openalex.org/", ""));

afterEach(() => vi.unstubAllGlobals());

describe("lectures par identifiants (QUAL-41)", () => {
  it("ordre demandé, doublons retirés, identifiants inconnus omis, 50 au plus", async () => {
    const calls = fakeOpenAlex({ known: ["W1", "W2", "W3"] });
    const works = await getQualityWorksByIds(["https://openalex.org/W3", "W1", "W3", "W9", "W2"]);
    expect(ids(works)).toEqual(["W3", "W1", "W2"]);
    expect(calls).toHaveLength(1);
    expect(calls[0].searchParams.get("per-page")).toBe("4");
    expect(filtersOf(calls[0]).at(-1)).toBe("ids.openalex:W3|W1|W9|W2");

    const many = Array.from({ length: 70 }, (_, i) => `W${i + 1}`);
    await getSeedMeta(many);
    expect(filtersOf(calls[1])).toEqual([`ids.openalex:${many.slice(0, 50).join("|")}`]);
  });

  it("aucun identifiant : pas d'appel", async () => {
    const calls = fakeOpenAlex();
    expect(await getSeedMeta(["", "https://openalex.org/"])).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("garde-fous qualité : types vérifiés, revues indexées, résumé, sans paratexte ni rétracté", async () => {
    const calls = fakeOpenAlex({ known: ["W1"] });
    await getQualityWorksByIds(["W1"]);
    await getRecentByTopic("https://openalex.org/T10", 2024, 3);
    for (const call of calls) {
      expect(filtersOf(call)).toEqual(expect.arrayContaining(["is_paratext:false", "is_retracted:false", "primary_location.source.is_core:true", "has_abstract:true"]));
      expect(filtersOf(call).some((f) => f.startsWith("type:article|review|book"))).toBe(true);
    }
    expect(filtersOf(calls[1])).toEqual(expect.arrayContaining(["primary_topic.id:T10", "publication_year:>2023", "referenced_works_count:>0"]));
  });
});

describe("articles proches, une règle pour la fiche et le MCP (QUAL-39)", () => {
  const work = { id: "https://openalex.org/W100", related_works: ["W1", "W2"], primary_topic: { id: "https://openalex.org/T5", display_name: "Sujet" } } as Parameters<typeof getSimilarWorks>[0];

  it("assez d'apparentés : pas de complément par sujet", async () => {
    const calls = fakeOpenAlex({ known: ["W1", "W2"] });
    expect(ids(await getSimilarWorks(work, 2, 6))).toEqual(["W1", "W2"]);
    expect(calls).toHaveLength(1);
  });

  it("trop peu : complément par sujet, sans doublon ni l'article lui-même, `topicCount` + 1 demandés", async () => {
    const calls = fakeOpenAlex({ known: ["W1", "W2"], topicResults: ["W2", "W100", "W7", "W8"] });
    expect(ids(await getSimilarWorks(work, 3, 6))).toEqual(["W1", "W2", "W7", "W8"]);
    expect(calls).toHaveLength(2);
    expect(calls[1].searchParams.get("per-page")).toBe("7");
    expect(filtersOf(calls[1])).toContain("primary_topic.id:T5");
  });

  it("sans sujet principal : les apparentés seuls", async () => {
    const calls = fakeOpenAlex({ known: ["W1"] });
    expect(ids(await getSimilarWorks({ ...work, primary_topic: null }, 6, 6))).toEqual(["W1"]);
    expect(calls).toHaveLength(1);
  });
});

describe("notice absente : null sur 404, erreur sinon (QUAL-41)", () => {
  it("404 → null pour un article, un sujet, un auteur", async () => {
    fakeOpenAlex({ status: 404 });
    expect(await getWork("W1")).toBeNull();
    expect(await getTopic("T1")).toBeNull();
    expect(await getAuthorProfile("A1")).toBeNull();
  });

  it("une autre erreur remonte", async () => {
    fakeOpenAlex({ status: 403 });
    await expect(getWork("W1")).rejects.toBeInstanceOf(OpenAlexError);
    await expect(getTopic("T1")).rejects.toMatchObject({ status: 403 });
  });
});
