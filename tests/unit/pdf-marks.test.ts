import { describe, expect, it } from "vitest";
import { matchSpanIndexes } from "@/lib/pdf-marks";

const hits = (spans: string[], needles: string[]) => [...matchSpanIndexes(spans, needles)].sort((a, b) => a - b);

describe("matchSpanIndexes (appariement des passages dans la couche texte, QUAL-40)", () => {
  it("un passage sur plusieurs fragments, casse et espaces ignorées", () => {
    expect(hits(["Le climat change", "plus vite que prévu,", "selon le rapport."], ["change plus  VITE"])).toEqual([0, 1]);
  });

  it("un mot coupé en deux fragments par PDF.js est retrouvé (« exam » + « ple »)", () => {
    expect(hits(["Un exam", "ple de texte", "suivant"], ["un example de texte"])).toEqual([0, 1]);
  });

  it("toutes les occurrences, sans chevauchement, et plusieurs passages", () => {
    expect(hits(["eau", "terre", "eau", "feu"], ["eau"])).toEqual([0, 2]);
    expect(hits(["eau", "terre", "eau", "feu"], ["terre", "feu"])).toEqual([1, 3]);
  });

  it("rien pour un passage vide, fait de blancs ou absent de la page", () => {
    expect(hits(["un", "deux"], ["", "   ", "trois"])).toEqual([]);
    expect(hits([], ["un"])).toEqual([]);
  });
});
