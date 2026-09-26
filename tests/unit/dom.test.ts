// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { markSpans } from "@/lib/pdf-marks";
import { clearRecent, pushRecent, readRecent, RECENT_KEY, restoreRecent } from "@/lib/recent";
import { clearHidden, hideRecommendation, HIDDEN_KEY, readHidden, RECO_LIMITS, unhideRecommendation } from "@/lib/recommendations-shared";

/** Couche texte PDF.js simplifiée : un <span> par fragment ; « \n » seul = fin de ligne (<br>, comme `hasEOL`). */
function textLayer(fragments: string[]): HTMLElement {
  const div = document.createElement("div");
  for (const f of fragments) {
    if (f === "\n") {
      div.appendChild(document.createElement("br"));
      continue;
    }
    const span = document.createElement("span");
    span.textContent = f;
    div.appendChild(span);
  }
  return div;
}
const marked = (el: HTMLElement) => [...el.querySelectorAll("span.hl")].map((s) => s.textContent);

describe("markSpans (surlignage dans le lecteur PDF)", () => {
  it("marque les fragments couverts par un passage, même à cheval sur plusieurs lignes", () => {
    const el = textLayer(["Le climat change", "\n", "plus vite que prévu,", "\n", "selon le rapport."]);
    markSpans(el, ["change plus  VITE"]);
    expect(marked(el)).toEqual(["Le climat change", "plus vite que prévu,"]);
  });

  it("un mot coupé en deux fragments sur la même ligne est retrouvé, sans inventer de frontière ailleurs", () => {
    const el = textLayer(["Un exam", "ple", " ", "de texte"]);
    markSpans(el, ["example de"]);
    expect(marked(el)).toEqual(["Un exam", "ple", "de texte"]);
    markSpans(el, ["exam ple"]);
    expect(marked(el)).toEqual([]);
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

  it("expose le marquage aux lecteurs d'écran (rôle mark), et le retire avec la marque", () => {
    const el = textLayer(["un", "deux"]);
    for (const s of el.querySelectorAll("span")) s.setAttribute("role", "presentation");
    markSpans(el, ["deux"]);
    expect([...el.querySelectorAll("span")].map((s) => s.getAttribute("role"))).toEqual(["presentation", "mark"]);
    markSpans(el, ["un"]);
    expect([...el.querySelectorAll("span")].map((s) => s.getAttribute("role"))).toEqual(["mark", "presentation"]);
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

  it("historique : « Annuler » après l'effacement remet la liste, après les consultations faites entre-temps (A11Y-19)", () => {
    for (const id of ["W1", "W2", "W3"]) pushRecent(work(id));
    const previous = readRecent();
    clearRecent();
    pushRecent(work("W9"));
    pushRecent(work("W2"));
    restoreRecent(previous);
    expect(readRecent().map((w) => w.id)).toEqual(["W2", "W9", "W3", "W1"]);
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

  it("suggestions écartées : plafonnées à la borne lue par /api/recommendations (RECO_LIMITS, QUAL-24)", () => {
    expect(RECO_LIMITS).toEqual({ seen: 12, fav: 30, hide: 200 });
    for (let i = 0; i < RECO_LIMITS.hide + 5; i++) hideRecommendation(`W${1000 + i}`);
    expect(readHidden()).toHaveLength(RECO_LIMITS.hide);
    expect(readHidden()[0]).toBe(`W${1000 + RECO_LIMITS.hide + 4}`);
  });
});
