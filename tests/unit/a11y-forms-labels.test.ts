// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { excerpt, favoriteLabel, moveLabel, shortTitle, withArticle } from "@/lib/labels";
import { feedbackTitleHint, feedbackTitleLength, MIN_FEEDBACK_TITLE, sanitizeFeedback } from "@/lib/feedback-shared";
import { isTypingTarget, neighbourEquivalent } from "@/lib/focus";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("noms des boutons répétés sur les cartes (A11Y-23)", () => {
  it("le cœur cite l'article, action d'abord", () => {
    expect(favoriteLabel("Cancer statistics, 2025")).toBe("Favori : Cancer statistics, 2025");
  });

  it("titre long raccourci à 12 mots, espaces normalisés, titre absent remplacé", () => {
    const long = "un deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze";
    expect(shortTitle(long)).toBe("un deux trois quatre cinq six sept huit neuf dix onze douze…");
    expect(shortTitle("  Titre \n sur   deux lignes ")).toBe("Titre sur deux lignes");
    expect(shortTitle("")).toBe("cet article");
    expect(shortTitle(null)).toBe("cet article");
  });

  it("le libellé visible reste en tête (listes), les flèches nomment l'article", () => {
    expect(withArticle("Ajouter à une liste", "Deep learning")).toBe("Ajouter à une liste : Deep learning");
    expect(withArticle("Dans 2 listes, modifier", "Deep learning")).toBe("Dans 2 listes, modifier : Deep learning");
    expect(moveLabel("up", "Deep learning")).toBe("Monter « Deep learning » dans la liste");
    expect(moveLabel("down", "Deep learning")).toBe("Descendre « Deep learning » dans la liste");
  });
});

describe("extrait d'un passage dans un nom de bouton (A11Y-26)", () => {
  it("points de suspension seulement si le passage est coupé", () => {
    expect(excerpt("Court passage.")).toBe("Court passage.");
    expect(excerpt("a".repeat(40))).toBe("a".repeat(40));
    expect(excerpt("a".repeat(41))).toBe(`${"a".repeat(40)}…`);
    expect(excerpt("mot ".repeat(20), 10)).toBe("mot mot mo…");
  });

  it("retours à la ligne et espaces multiples ramenés à une espace", () => {
    expect(excerpt("Ligne un\n\nligne   deux")).toBe("Ligne un ligne deux");
  });
});

describe("titre d'un retour : minimum annoncé et compté comme le serveur (A11Y-21)", () => {
  it("compte comme sanitizeFeedback : espaces en trop et caractères invisibles exclus", () => {
    expect(feedbackTitleLength("  Bug  ")).toBe(3);
    expect(feedbackTitleLength("a    b")).toBe(3);
    expect(feedbackTitleLength("ab​cd")).toBe(4);
    for (const title of ["Bug", "a    b", "ab​cd", "Bugs!", "  Un vrai titre  "]) {
      const accepted = sanitizeFeedback({ kind: "bug", title }) !== null;
      expect(accepted).toBe(feedbackTitleLength(title) >= MIN_FEEDBACK_TITLE);
    }
  });

  it("indication : règle et progression, puis règle seule ; texte d'erreur après un envoi refusé", () => {
    expect(feedbackTitleHint(0)).toBe("5 caractères minimum (0/5)");
    expect(feedbackTitleHint(3)).toBe("5 caractères minimum (3/5)");
    expect(feedbackTitleHint(5)).toBe("5 caractères minimum");
    expect(feedbackTitleHint(3, true)).toBe("Titre trop court : 5 caractères minimum (3 pour l'instant).");
  });
});

describe("isTypingTarget : l'annonce MCP n'interrompt pas une saisie (A11Y-28)", () => {
  function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    document.body.appendChild(e);
    return e;
  }

  it("champs de texte, zones de texte et contenu éditable", () => {
    expect(isTypingTarget(el("input"))).toBe(true);
    expect(isTypingTarget(el("input", { type: "search" }))).toBe(true);
    expect(isTypingTarget(el("input", { type: "email" }))).toBe(true);
    expect(isTypingTarget(el("textarea"))).toBe(true);
    const editable = el("div");
    editable.contentEditable = "true";
    expect(isTypingTarget(editable)).toBe(true);
  });

  it("ni boutons, ni cases, ni champs en lecture seule ou désactivés, ni rien", () => {
    expect(isTypingTarget(el("button"))).toBe(false);
    expect(isTypingTarget(el("input", { type: "checkbox" }))).toBe(false);
    expect(isTypingTarget(el("input", { type: "radio" }))).toBe(false);
    expect(isTypingTarget(el("input", { type: "submit" }))).toBe(false);
    expect(isTypingTarget(el("input", { readonly: "" }))).toBe(false);
    expect(isTypingTarget(el("textarea", { disabled: "" }))).toBe(false);
    expect(isTypingTarget(el("a", { href: "/" }))).toBe(false);
    expect(isTypingTarget(document.body)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("neighbourEquivalent : focus après une révocation confirmée (A11Y-24)", () => {
  function keys(ids: string[]): HTMLUListElement {
    const ul = document.createElement("ul");
    ul.innerHTML = ids.map((id) => `<li data-id="${id}"><span>${id}</span><button data-focus-key="revoke" aria-label="Révoquer la clé ${id}">Révoquer</button></li>`).join("");
    document.body.appendChild(ul);
    return ul;
  }
  const revokeOf = (ul: HTMLElement, id: string) => ul.querySelector<HTMLElement>(`li[data-id="${id}"] button`)!;

  it("« Révoquer » de la clé suivante, sinon de la précédente", () => {
    const ul = keys(["a", "b", "c"]);
    expect(neighbourEquivalent(ul, ":scope > li", revokeOf(ul, "a"))).toBe(revokeOf(ul, "b"));
    expect(neighbourEquivalent(ul, ":scope > li", revokeOf(ul, "b"))).toBe(revokeOf(ul, "c"));
    expect(neighbourEquivalent(ul, ":scope > li", revokeOf(ul, "c"))).toBe(revokeOf(ul, "b"));
  });

  it("null pour la seule clé (le champ « Nom de la clé » prend le relais), un élément hors liste ou absent", () => {
    const ul = keys(["a"]);
    expect(neighbourEquivalent(ul, ":scope > li", revokeOf(ul, "a"))).toBeNull();
    expect(neighbourEquivalent(ul, ":scope > li", document.body)).toBeNull();
    expect(neighbourEquivalent(ul, ":scope > li", null)).toBeNull();
    expect(neighbourEquivalent(null, ":scope > li", revokeOf(ul, "a"))).toBeNull();
  });
});
