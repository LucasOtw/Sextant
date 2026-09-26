// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { captureListFocus, equivalentIn, focusElement, focusKeyOf, recoveryTarget } from "@/lib/focus";
import { isQuietRoute } from "@/lib/quiet-routes";
import { feedbackOrder, inOrder, type FeedbackItem } from "@/lib/feedback-shared";

afterEach(() => {
  document.body.innerHTML = "";
});

/** Liste de lignes semblables à /favoris ou « Mes surlignages » : un lien, un cœur au nom commun, un « Supprimer » à clé. */
function list(ids: string[]): HTMLUListElement {
  const ul = document.createElement("ul");
  ul.innerHTML = ids
    .map(
      (id) => `<li data-id="${id}">
        <a href="/article/${id}">Titre ${id}</a>
        <button aria-label="Favori">♥</button>
        <button data-focus-key="delete" aria-label="Supprimer le passage ${id}">Supprimer</button>
      </li>`,
    )
    .join("");
  document.body.appendChild(ul);
  return ul;
}
const row = (ul: HTMLElement, id: string) => ul.querySelector<HTMLElement>(`li[data-id="${id}"]`)!;
const del = (ul: HTMLElement, id: string) => row(ul, id).querySelector<HTMLElement>('[data-focus-key="delete"]')!;
const heart = (ul: HTMLElement, id: string) => row(ul, id).querySelector<HTMLElement>('[aria-label="Favori"]')!;

describe("focusElement (liens d'évitement, A11Y-11)", () => {
  it("rend une zone non focalisable focalisable le temps d'y être, puis la rend à la page", () => {
    const main = document.createElement("main");
    document.body.appendChild(main);
    focusElement(main);
    expect(document.activeElement).toBe(main);
    expect(main.getAttribute("tabindex")).toBe("-1");
    main.dispatchEvent(new FocusEvent("blur"));
    expect(main.hasAttribute("tabindex")).toBe(false);
  });

  it("ne touche pas au tabindex d'une cible déjà focalisable (titre de la liste de résultats)", () => {
    const h2 = document.createElement("h2");
    h2.tabIndex = -1;
    document.body.appendChild(h2);
    focusElement(h2);
    expect(document.activeElement).toBe(h2);
    h2.dispatchEvent(new FocusEvent("blur"));
    expect(h2.getAttribute("tabindex")).toBe("-1");
  });
});

describe("équivalent d'un contrôle dans la ligne voisine (A11Y-19)", () => {
  it("par clé data-focus-key, par nom commun, sinon par rang", () => {
    const ul = list(["A", "B"]);
    expect(equivalentIn(row(ul, "B"), focusKeyOf(row(ul, "A"), del(ul, "A")))).toBe(del(ul, "B"));
    expect(equivalentIn(row(ul, "B"), focusKeyOf(row(ul, "A"), heart(ul, "A")))).toBe(heart(ul, "B"));
    const link = row(ul, "A").querySelector("a")!;
    expect(equivalentIn(row(ul, "B"), focusKeyOf(row(ul, "A"), link))).toBe(row(ul, "B").querySelector("a"));
  });

  it("un contrôle désactivé n'est pas une cible : repli sur le premier élément focalisable de la ligne", () => {
    const ul = list(["A", "B"]);
    (del(ul, "B") as HTMLButtonElement).disabled = true;
    expect(equivalentIn(row(ul, "B"), focusKeyOf(row(ul, "A"), del(ul, "A")))).toBe(row(ul, "B").querySelector("a"));
  });
});

describe("reprise du focus après le retrait d'une ligne (A11Y-19)", () => {
  it("ligne retirée : même contrôle dans la ligne qui prend sa place, sinon dans la précédente", () => {
    const ul = list(["A", "B", "C"]);
    del(ul, "B").focus();
    const last = captureListFocus(ul, ":scope > li", del(ul, "B"));
    expect(last?.row).toBe(1);
    row(ul, "B").remove();
    expect(recoveryTarget(last, ul, ":scope > li")).toBe(del(ul, "C"));

    const last2 = captureListFocus(ul, ":scope > li", del(ul, "C"));
    row(ul, "C").remove();
    expect(recoveryTarget(last2, ul, ":scope > li")).toBe(del(ul, "A"));
  });

  it("liste vidée ou démontée : la cible de repli", () => {
    const ul = list(["A"]);
    const heading = document.createElement("h2");
    document.body.appendChild(heading);
    const last = captureListFocus(ul, ":scope > li", heart(ul, "A"));
    ul.remove();
    expect(recoveryTarget(last, null, ":scope > li", () => heading)).toBe(heading);
  });

  it("rien tant que la ligne est là (déplacée, ou champ interne fermé), ni quand le focus est déjà ailleurs", () => {
    const ul = list(["A", "B"]);
    const last = captureListFocus(ul, ":scope > li", del(ul, "A"));
    ul.appendChild(row(ul, "A"));
    expect(recoveryTarget(last, ul, ":scope > li")).toBeNull();

    const outside = document.createElement("button");
    document.body.appendChild(outside);
    const last2 = captureListFocus(ul, ":scope > li", del(ul, "B"));
    row(ul, "B").remove();
    outside.focus();
    expect(recoveryTarget(last2, ul, ":scope > li")).toBeNull();
  });

  it("n'enregistre que les éléments d'une ligne de la liste", () => {
    const ul = list(["A"]);
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    expect(captureListFocus(ul, ":scope > li", outside)).toBeNull();
    expect(captureListFocus(null, ":scope > li", del(ul, "A"))).toBeNull();
  });
});

describe("pages sans fenêtre d'accueil (A11Y-07)", () => {
  it("lecteur, liste partagée et pages légales", () => {
    for (const p of ["/article/W1/lire", "/liste/abc123", "/conditions", "/confidentialite", "/mentions-legales"]) expect(isQuietRoute(p)).toBe(true);
  });
  it("les autres pages, y compris les voisines de nom", () => {
    for (const p of ["/", "/search", "/article/W1", "/article/W1/lirex", "/liste", "/conditionsx", "/theme/informatique", "/compte"]) expect(isQuietRoute(p)).toBe(false);
  });
});

describe("ordre figé des sujets de /retours (A11Y-19)", () => {
  const item = (id: string, votes: number, createdAt: string): FeedbackItem => ({ id, kind: "idea", title: id, description: "", votes, status: "open", createdAt });
  const items = [item("a", 1, "2026-01-01"), item("b", 5, "2026-01-02"), item("c", 5, "2026-01-03")];

  it("par votes (puis les plus récents), ou par date", () => {
    expect(feedbackOrder(items, "votes")).toEqual(["c", "b", "a"]);
    expect(feedbackOrder(items, "recent")).toEqual(["c", "b", "a"]);
    expect(feedbackOrder([item("x", 0, "2026-01-01"), item("y", 9, "2025-01-01")], "recent")).toEqual(["x", "y"]);
  });

  it("un vote ne déplace pas la ligne ; un sujet publié depuis passe en tête", () => {
    const order = feedbackOrder(items, "votes");
    const voted = items.map((i) => (i.id === "a" ? { ...i, votes: 10 } : i));
    expect(inOrder(voted, order).map((i) => i.id)).toEqual(["c", "b", "a"]);
    expect(inOrder([item("new", 1, "2026-02-01"), ...voted], order).map((i) => i.id)).toEqual(["new", "c", "b", "a"]);
  });
});
