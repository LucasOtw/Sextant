import { describe, expect, it } from "vitest";
import { joinFragments, matchSpanIndexes } from "@/lib/pdf-marks";

const hits = (spans: string[], needles: string[]) => [...matchSpanIndexes(spans, needles)].sort((a, b) => a - b);

describe("matchSpanIndexes (appariement des passages dans la couche texte, QUAL-40)", () => {
  it("un passage sur plusieurs fragments séparés par un blanc (fin de ligne, espace), casse et blancs répétés ignorés", () => {
    expect(hits(["Le climat change ", "plus vite que prévu,", "selon le rapport."], ["change plus  VITE"])).toEqual([0, 1]);
    expect(hits(["Le climat change", "\n", "plus vite"], ["change\nplus"])).toEqual([0, 2]);
  });

  it("un mot coupé en deux fragments par PDF.js est retrouvé (« exam » + « ple »)", () => {
    expect(hits(["Un exam", "ple de texte", "suivant"], ["un example de texte"])).toEqual([0, 1]);
  });

  it("aucune frontière de mot inventée : « The rapist » ne s'apparie pas à « therapist », « no where » à « nowhere »", () => {
    expect(hits(["The rapist", " is"], ["therapist"])).toEqual([]);
    expect(hits(["no where"], ["nowhere"])).toEqual([]);
    expect(hits(["now", "here"], ["no where"])).toEqual([]);
  });

  it("les blancs d'un passage ne s'effacent pas : deux fragments collés ne s'apparient pas à un passage à deux mots", () => {
    expect(hits(["Le climat change", "plus vite"], ["change plus"])).toEqual([]);
  });

  it("toutes les occurrences, sans chevauchement, et plusieurs passages", () => {
    expect(hits(["eau", "terre", "eau", "feu"], ["eau"])).toEqual([0, 2]);
    expect(hits(["eau", "terre", "eau", "feu"], ["terre", "feu"])).toEqual([1, 3]);
  });

  it("rien pour un passage vide, fait de blancs ou absent de la page", () => {
    expect(hits(["un", "deux"], ["", "   ", "trois"])).toEqual([]);
    expect(hits([], ["un"])).toEqual([]);
  });

  it("joinFragments : espace gardée là où la source en a une, attribuée au fragment suivant", () => {
    expect(joinFragments(["Un exam", "ple", "  de\ttexte ", "\n", " suivant"])).toEqual({
      text: "Un example de texte suivant",
      owner: [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 4, 4, 4, 4, 4, 4, 4, 4],
    });
    expect(joinFragments([" ", "\n"]).text).toBe("");
  });
});
