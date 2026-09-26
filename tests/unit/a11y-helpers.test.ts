import { describe, expect, it, vi } from "vitest";
import { contentLang, titleLang } from "@/lib/format";
import { lastPageOf, pagedTitle, resultsMessage } from "@/lib/search-params";
import { isAlreadyHighlighted, passagesFrom, pdfPageText, splitSentences } from "@/lib/sentences";

vi.mock("sonner", () => ({ toast: vi.fn(() => "id") }));

describe("contentLang / titleLang (langue des passages, A11Y-04)", () => {
  it("garde un code de langue valide, en minuscules", () => {
    expect(contentLang("en")).toBe("en");
    expect(contentLang(" PT ")).toBe("pt");
    expect(contentLang("zh-hans")).toBe("zh-hans");
  });

  it("rien pour le français (hérité de la page), un code absent ou mal formé", () => {
    expect(contentLang("fr")).toBeUndefined();
    expect(contentLang(null)).toBeUndefined();
    expect(contentLang("")).toBeUndefined();
    expect(contentLang("en\" onmouseover=\"x")).toBeUndefined();
    expect(contentLang("123")).toBeUndefined();
  });

  it("titre absent : « Sans titre » est en français, pas de langue", () => {
    expect(titleLang({ title: "Cancer statistics", display_name: null, language: "en" })).toBe("en");
    expect(titleLang({ title: null, display_name: "Cancer statistics", language: "en" })).toBe("en");
    expect(titleLang({ title: null, display_name: null, language: "en" })).toBeUndefined();
  });
});

describe("pagination et annonces de résultats (A11Y-12)", () => {
  it("dernière page bornée aux 10 000 premiers résultats, au moins 1", () => {
    expect(lastPageOf(0, 20)).toBe(1);
    expect(lastPageOf(41, 20)).toBe(3);
    expect(lastPageOf(1_000_000, 20)).toBe(500);
  });

  it("le titre porte la page au-delà de la première", () => {
    expect(pagedTitle("Informatique", 1)).toBe("Informatique");
    expect(pagedTitle("Informatique", undefined)).toBe("Informatique");
    expect(pagedTitle("« climat »", 3)).toBe("« climat » — page 3");
  });

  it("message : nombre, requête, page", () => {
    const nb = (s: string) => s.replace(/\s/g, " ");
    expect(nb(resultsMessage(1234, 2, 20, "climat"))).toBe("1 234 résultats pour « climat », page 2 sur 62.");
    expect(resultsMessage(1, 1, 20)).toBe("1 résultat.");
    expect(nb(resultsMessage(50_000, 1, 20))).toBe("50 000 résultats, page 1 sur 500.");
  });
});

describe("choix de phrases à surligner (A11Y-18)", () => {
  const full = "Le climat change.  Les océans se réchauffent vite ! Et après ?\nOn agit.";

  it("découpe en phrases, positions exactes, espaces de bord retirés", () => {
    const s = splitSentences(full);
    expect(s.map((x) => x.text)).toEqual(["Le climat change.", "Les océans se réchauffent vite !", "Et après ?", "On agit."]);
    for (const x of s) expect(full.slice(x.start, x.end).replace(/\s+/g, " ")).toBe(x.text);
  });

  it("phrases consécutives réunies en un passage, contexte comme readSelection", () => {
    const s = splitSentences(full);
    const passages = passagesFrom(full, s, [3, 1, 0, 0, 99]);
    expect(passages).toEqual([
      { text: "Le climat change. Les océans se réchauffent vite !", prefix: "", suffix: " Et après ? On agit." },
      { text: "On agit.", prefix: "climat change. Les océans se réchauffent vite ! Et après ? ", suffix: "" }, // 60 caractères de contexte
    ]);
    // Le passage est retrouvable tel quel dans le texte normalisé (repérage du résumé).
    expect(full.replace(/\s+/g, " ").includes(passages[0].text)).toBe(true);
  });

  it("aucune phrase cochée : aucun passage", () => {
    expect(passagesFrom(full, splitSentences(full), [])).toEqual([]);
  });

  it("phrase déjà surlignée : casse et espaces ignorés", () => {
    expect(isAlreadyHighlighted("Les océans  se réchauffent", ["le climat change. les océans se réchauffent vite !"])).toBe(true);
    expect(isAlreadyHighlighted("On agit.", ["Le climat change."])).toBe(false);
    expect(isAlreadyHighlighted("  ", ["x"])).toBe(false);
  });

  it("texte d'une page PDF : fragments non vides joints par une espace", () => {
    expect(pdfPageText([{ str: "Le  climat" }, { str: " " }, { str: "change." }, { type: "beginMarkedContent" }, null])).toBe("Le climat change.");
    // Fin de ligne (`hasEOL`) = frontière de mot ; deux fragments collés (mot coupé par PDF.js) restent collés.
    expect(pdfPageText([{ str: "fin", hasEOL: true }, { str: "de ligne" }, { str: "", hasEOL: true }, { str: "Un exam" }, { str: "ple." }])).toBe("fin de ligne Un example.");
  });
});

describe("undoToast (A11Y-20)", () => {
  it("10 s, bouton de fermeture, action « Annuler » et raccourci pour les lecteurs d'écran", async () => {
    const { toast } = await import("sonner");
    const { undoToast, UNDO_TOAST_MS } = await import("@/lib/undo-toast");
    const onUndo = vi.fn();
    undoToast("Citation supprimée.", onUndo);
    const [message, options] = vi.mocked(toast).mock.calls[0] as unknown as [string, { duration: number; closeButton: boolean; action: { label: string; onClick: () => void } }];
    expect(message).toBe("Citation supprimée.");
    expect(options.duration).toBe(UNDO_TOAST_MS);
    expect(UNDO_TOAST_MS).toBeGreaterThanOrEqual(10_000);
    expect(options.closeButton).toBe(true);
    expect(options.action.label).toBe("Annuler");
    options.action.onClick();
    expect(onUndo).toHaveBeenCalledOnce();
  });
});
