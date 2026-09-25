import { describe, expect, it } from "vitest";
import {
  citationBlock,
  cleanText,
  MAX_HIGHLIGHT_TEXT,
  sanitizeHighlightInput,
  sanitizePage,
  sourceLabel,
  tooLong,
  type Highlight,
} from "@/lib/highlights-shared";
import { MAX_COLLECTION_DESCRIPTION, MAX_COLLECTION_NAME, sanitizeCollectionDescription, sanitizeCollectionName, SHARE_TOKEN, shareUrl } from "@/lib/collections-shared";
import { MAX_FEEDBACK_TITLE, sanitizeFeedback } from "@/lib/feedback-shared";
import { makeSnapshot } from "../fixtures";

describe("cleanText (surlignages, notes, retours)", () => {
  it("retire les caractères de contrôle et invisibles, réduit les espaces", () => {
    expect(cleanText("  a\u0000b\u200Bc d  \n e \u202E", 100)).toBe("abc d e");
  });

  // Défauts connus (QUAL-32, lot 10 de l'audit) : ces tests échouent tant que le défaut existe (`it.fails`) ;
  // le correctif QUAL-32 doit retirer `.fails`.
  it.fails("QUAL-32 — une tabulation sépare les mots au lieu de les coller", () => {
    expect(cleanText("mot1\tmot2", 100)).toBe("mot1 mot2");
  });

  it.fails("QUAL-32 — les émojis composés (ZWJ) restent intacts", () => {
    const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}";
    expect(cleanText(family, 100)).toBe(family);
  });

  it("garde les sauts de ligne si demandé, trois au plus deviennent deux", () => {
    expect(cleanText("l1\r\nl2\n\n\n\nl3   x", 100, true)).toBe("l1\nl2\n\nl3 x");
  });

  it("borne en points de code (un emoji ne se coupe pas en deux)", () => {
    expect(cleanText("😀😀😀", 2)).toBe("😀😀");
    expect(cleanText("abc", 2)).toBe("ab");
  });

  it("ignore ce qui n'est pas une chaîne", () => {
    expect(cleanText(42, 10)).toBe("");
    expect(cleanText({ toString: () => "x" }, 10)).toBe("");
  });

  it("tooLong compte en points de code", () => {
    expect(tooLong("😀😀", 2)).toBe(false);
    expect(tooLong("😀😀😀", 2)).toBe(true);
    expect(tooLong(123, 1)).toBe(false);
  });
});

describe("sanitizePage", () => {
  it("entier entre 1 et 100 000, sinon null", () => {
    expect(sanitizePage(4)).toBe(4);
    expect(sanitizePage(4.9)).toBe(4);
    expect(sanitizePage(0)).toBeNull();
    expect(sanitizePage(100_001)).toBeNull();
    expect(sanitizePage("4")).toBeNull();
    expect(sanitizePage(NaN)).toBeNull();
  });
});

describe("sanitizeHighlightInput", () => {
  const valid = { text: "  Un passage  retenu ", page: 3, note: "ma\n\n\n\nnote", source: "pdf", prefix: "avant", suffix: "après", article: makeSnapshot() };

  it("nettoie un surlignage valide", () => {
    expect(sanitizeHighlightInput(valid)).toEqual({ text: "Un passage retenu", page: 3, note: "ma\n\nnote", source: "pdf", prefix: "avant", suffix: "après", article: makeSnapshot() });
  });

  it("source inconnue ramenée à « manual », page invalide à null", () => {
    expect(sanitizeHighlightInput({ ...valid, source: "admin", page: -1 })).toMatchObject({ source: "manual", page: null });
  });

  it("refuse un texte trop long plutôt que de le tronquer en silence", () => {
    expect(sanitizeHighlightInput({ ...valid, text: "a".repeat(MAX_HIGHLIGHT_TEXT + 1) })).toBeNull();
    expect(sanitizeHighlightInput({ ...valid, text: "a".repeat(MAX_HIGHLIGHT_TEXT) })).not.toBeNull();
  });

  it("refuse un texte vide, un article invalide ou une entrée qui n'est pas un objet", () => {
    expect(sanitizeHighlightInput({ ...valid, text: " \u200B " })).toBeNull();
    expect(sanitizeHighlightInput({ ...valid, article: { id: "x" } })).toBeNull();
    expect(sanitizeHighlightInput(null)).toBeNull();
    expect(sanitizeHighlightInput("texte")).toBeNull();
  });

  it("libellé de la source et bloc de citation", () => {
    expect(sourceLabel({ source: "pdf", page: 12 })).toBe("PDF · p. 12");
    expect(sourceLabel({ source: "abstract", page: null })).toBe("Résumé");
    expect(sourceLabel({ source: "manual", page: null })).toBe("Saisi à la main");
    const h: Highlight = { ...sanitizeHighlightInput(valid)!, id: "h1", workId: "W4200000001", createdAt: null };
    expect(citationBlock(h)).toBe(
      "« Un passage retenu » (Piwowar & Priem, 2018, p. 3)\n\nPiwowar, H., & Priem, J. (2018). Open access and citation advantage. PeerJ. https://doi.org/10.1000/xyz123",
    );
  });
});

describe("listes (collections)", () => {
  it("nom nettoyé, borné, null s'il est vide", () => {
    expect(sanitizeCollectionName("  Mémoire\u0007   2026 ")).toBe("Mémoire 2026");
    expect(sanitizeCollectionName("x".repeat(MAX_COLLECTION_NAME + 20))).toHaveLength(MAX_COLLECTION_NAME);
    expect(sanitizeCollectionName(" \u200B\u200E ")).toBeNull();
    expect(sanitizeCollectionName(12)).toBeNull();
  });

  it("description nettoyée, bornée, vide autorisée", () => {
    expect(sanitizeCollectionDescription("  À lire\u0000 avant   lundi ")).toBe("À lire avant lundi");
    expect(sanitizeCollectionDescription("d".repeat(MAX_COLLECTION_DESCRIPTION + 1))).toHaveLength(MAX_COLLECTION_DESCRIPTION);
    expect(sanitizeCollectionDescription(null)).toBe("");
  });

  it.fails("QUAL-32 — un saut de ligne ou une tabulation dans la description sépare les mots", () => {
    expect(sanitizeCollectionDescription("À lire\navant\tlundi")).toBe("À lire avant lundi");
  });

  it("jeton de partage : 22 caractères base64url exactement", () => {
    expect(SHARE_TOKEN.test("AbCdEfGhIjKlMnOpQrSt_-")).toBe(true);
    expect(SHARE_TOKEN.test("AbCdEfGhIjKlMnOpQrSt_")).toBe(false);
    expect(SHARE_TOKEN.test("AbCdEfGhIjKlMnOpQrSt/=")).toBe(false);
    expect(SHARE_TOKEN.test("../../users/uid/secret")).toBe(false);
  });

  it("lien de partage sans double barre oblique", () => {
    expect(shareUrl("https://sextant.example/", "tok")).toBe("https://sextant.example/liste/tok");
  });
});

describe("retours (bugs et idées)", () => {
  it("accepte un sujet valide, nettoyé", () => {
    expect(sanitizeFeedback({ kind: "idea", title: "  Export   Zotero ", description: "l1\n\n\n\nl2" })).toEqual({ kind: "idea", title: "Export Zotero", description: "l1\n\nl2" });
  });

  it("refuse un type inconnu, un titre trop court, un tableau ou une valeur non objet", () => {
    expect(sanitizeFeedback({ kind: "spam", title: "Titre valide" })).toBeNull();
    expect(sanitizeFeedback({ kind: "bug", title: "abc" })).toBeNull();
    expect(sanitizeFeedback([{ kind: "bug", title: "Titre valide" }])).toBeNull();
    expect(sanitizeFeedback("bug")).toBeNull();
  });

  it("borne le titre", () => {
    expect(sanitizeFeedback({ kind: "bug", title: "t".repeat(500) })!.title).toHaveLength(MAX_FEEDBACK_TITLE);
  });
});
