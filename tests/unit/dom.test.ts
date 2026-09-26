// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { markSpans } from "@/lib/pdf-marks";
import { clearRecent, pushRecent, readRecent, RECENT_KEY } from "@/lib/recent";
import { clearHidden, hideRecommendation, HIDDEN_KEY, readHidden, unhideRecommendation } from "@/lib/recommendations-shared";

/** Couche texte PDF.js simplifiée : un <span> par fragment de ligne. */
function textLayer(fragments: string[]): HTMLElement {
  const div = document.createElement("div");
  for (const f of fragments) {
    const span = document.createElement("span");
    span.textContent = f;
    div.appendChild(span);
  }
  return div;
}
const marked = (el: HTMLElement) => [...el.querySelectorAll("span.hl")].map((s) => s.textContent);

describe("markSpans (surlignage dans le lecteur PDF)", () => {
  it("marque les fragments couverts par un passage, même à cheval sur plusieurs lignes", () => {
    const el = textLayer(["Le climat change", "plus vite que prévu,", "selon le rapport."]);
    markSpans(el, ["change plus  VITE"]);
    expect(marked(el)).toEqual(["Le climat change", "plus vite que prévu,"]);
  });

  it("marque toutes les occurrences", () => {
    const el = textLayer(["eau", "terre", "eau"]);
    markSpans(el, ["eau"]);
    expect(marked(el)).toEqual(["eau", "eau"]);
  });

  it("efface les marques précédentes et ignore les fragments vides ou de structure", () => {
    const el = textLayer(["un", "deux", " "]);
    const structure = document.createElement("span");
    structure.className = "markedContent";
    structure.textContent = "un";
    el.appendChild(structure);
    markSpans(el, ["un"]);
    expect(marked(el)).toEqual(["un"]);
    markSpans(el, []);
    expect(marked(el)).toEqual([]);
    markSpans(el, ["   "]);
    expect(marked(el)).toEqual([]);
  });
});

describe("stockage local : historique et suggestions écartées", () => {
  beforeEach(() => localStorage.clear());

  const work = (id: string) => ({ id, title: `Titre ${id}`, authors: "A", venue: null, year: 2024, isOa: false });

  it("historique : le plus récent d'abord, sans doublon, borné à 12", () => {
    for (let i = 1; i <= 14; i++) pushRecent(work(`W${i}`));
    pushRecent(work("W5"));
    const list = readRecent();
    expect(list).toHaveLength(12);
    expect(list[0].id).toBe("W5");
    expect(list.filter((w) => w.id === "W5")).toHaveLength(1);
    clearRecent();
    expect(readRecent()).toEqual([]);
  });

  it("historique : écarte les éléments corrompus et survit à un JSON illisible", () => {
    localStorage.setItem(RECENT_KEY, JSON.stringify([{ ...work("W1"), viewedAt: 1 }, { ...work("../x"), viewedAt: 1 }, { id: "W2" }, null, "W3"]));
    expect(readRecent().map((w) => w.id)).toEqual(["W1"]);
    localStorage.setItem(RECENT_KEY, "{pas du json");
    expect(readRecent()).toEqual([]);
  });

  it("suggestions écartées : ajout en tête, retrait, remise à zéro, valeurs non textuelles ignorées", () => {
    hideRecommendation("W1");
    hideRecommendation("W2");
    hideRecommendation("W1");
    expect(readHidden()).toEqual(["W1", "W2"]);
    unhideRecommendation("W1");
    expect(readHidden()).toEqual(["W2"]);
    clearHidden();
    expect(readHidden()).toEqual([]);
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(["W1", 2, null]));
    expect(readHidden()).toEqual(["W1"]);
  });
});
