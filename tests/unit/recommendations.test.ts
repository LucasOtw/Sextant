import { describe, expect, it } from "vitest";
import { interleaveRecommendations, parseIds, planRecommendations, seedWeights, topSeedIds, type SeedMeta } from "@/lib/recommendations-rank";
import { reasonText } from "@/lib/recommendations-shared";
import { makeWork } from "../fixtures";

const OA = "https://openalex.org/";

function seed(id: string, topic: string | null, related: string[]): SeedMeta {
  return {
    id: OA + id,
    display_name: `Titre ${id}`,
    title: null,
    primary_topic: topic ? { id: OA + topic, display_name: `Sujet ${topic}` } : null,
    related_works: related.map((r) => OA + r),
  };
}

describe("parseIds", () => {
  it("garde les identifiants plausibles, sans doublon, bornés", () => {
    expect(parseIds(" W12, W12,W1,T123,W34;W5,,W56 ", 10)).toEqual(["W12", "W56"]);
    expect(parseIds("W11,W22,W33", 2)).toEqual(["W11", "W22"]);
    expect(parseIds(null, 5)).toEqual([]);
    expect(parseIds(`W${"1".repeat(16)}`, 5)).toEqual([]);
  });
});

describe("poids des graines", () => {
  it("un favori pèse trois fois une consultation, et l'ancienneté diminue le poids", () => {
    const w = seedWeights(["W10", "W20"], ["W30", "W40"]);
    expect(w.get("W10")).toBeCloseTo(3);
    expect(w.get("W20")).toBeCloseTo(3 / 1.15);
    expect(w.get("W30")).toBeCloseTo(1);
    expect(w.get("W40")).toBeCloseTo(1 / 1.3);
  });

  it("un article à la fois favori et consulté cumule", () => {
    expect(seedWeights(["W10"], ["W10"]).get("W10")).toBeCloseTo(4);
  });

  it("topSeedIds trie par poids décroissant et borne", () => {
    const w = seedWeights(["W10"], ["W20", "W30", "W10"]);
    expect(topSeedIds(w, 2)).toEqual(["W10", "W20"]);
  });
});

describe("planRecommendations", () => {
  const weight = new Map([
    ["W10", 3],
    ["W20", 1],
    ["W30", 0.5],
  ]);
  const seeds = [seed("W10", "T1", ["W100", "W200", "W20"]), seed("W20", "T2", ["W200", "W300"]), seed("W30", "T1", ["W300", "W400"])];

  it("classe d'abord les apparentés qui reviennent chez plusieurs graines, puis au poids", () => {
    const plan = planRecommendations(seeds, weight, new Set(["W10", "W20", "W30"]), 3);
    // W200 : W10 + W20 (4) ; W300 : W20 + W30 (1,5) ; puis W100 (3), W400 (0,5). W20 est exclu (déjà lu).
    expect(plan.relatedIds).toEqual(["W200", "W300", "W100", "W400"]);
    expect(plan.relatedSeeds.get("W200")).toEqual([
      { id: "W10", title: "Titre W10" },
      { id: "W20", title: "Titre W20" },
    ]);
  });

  it("classe les sujets par poids cumulé et borne leur nombre", () => {
    const plan = planRecommendations(seeds, weight, new Set(), 1);
    expect(plan.topics).toEqual([{ id: OA + "T1", name: "Sujet T1", seeds: [{ id: "W10", title: "Titre W10" }, { id: "W30", title: "Titre W30" }] }]);
  });

  it("borne le nombre d'apparentés demandés à OpenAlex", () => {
    const many = [seed("W10", null, Array.from({ length: 40 }, (_, i) => `W${1000 + i}`))];
    expect(planRecommendations(many, weight, new Set(), 3).relatedIds).toHaveLength(18);
  });

  it("donne un titre de repli à une graine sans titre", () => {
    const plan = planRecommendations([{ ...seed("W10", "T1", []), display_name: "  " }], weight, new Set(), 3);
    expect(plan.topics[0].seeds[0].title).toBe("un article");
  });
});

describe("interleaveRecommendations", () => {
  const plan = {
    relatedIds: ["W100", "W200"],
    relatedSeeds: new Map([["W100", [{ id: "W10", title: "Titre W10" }]]]),
    topics: [
      { id: OA + "T1", name: "Sujet T1", seeds: [{ id: "W10", title: "Titre W10" }, { id: "W30", title: "Titre W30" }] },
      { id: OA + "T2", name: "Sujet T2", seeds: [{ id: "W20", title: "Titre W20" }] },
    ],
  };
  const w = (id: string) => makeWork({ id: OA + id });

  it("alterne apparenté et sujet, sans doublon ni article exclu, dans la limite demandée", () => {
    const out = interleaveRecommendations(plan, [w("W100"), w("W200")], [[w("W500"), w("W100"), w("W700")], [w("W600")]], new Set(["W700"]), 4);
    expect(out.map((r) => r.work.id.replace(OA, ""))).toEqual(["W100", "W500", "W200", "W600"]);
    expect(out[0].reason).toEqual({ kind: "related", seeds: [{ id: "W10", title: "Titre W10" }] });
    expect(out[1].reason).toEqual({ kind: "topic", topic: "Sujet T1", seeds: [{ id: "W10", title: "Titre W10" }] });
    expect(out[2].reason).toEqual({ kind: "related", seeds: [] });
  });

  it("continue avec une seule source quand l'autre est vide", () => {
    const out = interleaveRecommendations(plan, [], [[w("W500"), w("W501")], []], new Set(), 6);
    expect(out.map((r) => r.work.id.replace(OA, ""))).toEqual(["W500", "W501"]);
  });

  it("rien à proposer : liste vide", () => {
    expect(interleaveRecommendations({ relatedIds: [], relatedSeeds: new Map(), topics: [] }, [], [], new Set(), 6)).toEqual([]);
  });
});

describe("reasonText", () => {
  it("phrase le pourquoi d'une suggestion", () => {
    expect(reasonText({ kind: "related", seeds: [{ id: "W1", title: "A" }] })).toBe("Proche de « A »");
    expect(reasonText({ kind: "related", seeds: [{ id: "W1", title: "A" }, { id: "W2", title: "B" }] })).toBe("Proche de « A » et « B »");
    expect(reasonText({ kind: "topic", topic: "Climat", seeds: [] })).toBe("Récent et cité sur « Climat », comme vos lectures");
  });
});
