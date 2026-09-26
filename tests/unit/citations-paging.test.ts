// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { CitationsList } from "@/components/highlights/citations-list";
import { PAGE_SIZE } from "@/lib/list-filter";
import type { Highlight } from "@/lib/highlights-shared";
import { makeSnapshot } from "../fixtures";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function highlight(i: number): Highlight {
  const article = { ...makeSnapshot({ id: `W${(i % 7) + 1}`, title: `Article ${(i % 7) + 1}` }) };
  return { id: `h${i}`, workId: article.id, text: i % 2 ? `Passage ${i} sur l'écologie` : `Passage ${i} sur le climat`, note: "", page: null, source: "abstract", prefix: "", suffix: "", article, createdAt: null } as unknown as Highlight;
}

let container: HTMLDivElement;
afterEach(() => container?.remove());

async function render(items: Highlight[]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(createElement(CitationsList, { initial: items, collections: [] })));
  return root;
}

const cards = () => container.querySelectorAll("blockquote").length;
const more = () => [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("de plus"));

describe("CitationsList par tranches (PERF-11)", () => {
  it("ne monte que la première tranche, « Afficher plus » ajoute la suivante, le compteur porte sur tout", async () => {
    await render(Array.from({ length: 120 }, (_, i) => highlight(i)));
    expect(cards()).toBe(PAGE_SIZE);
    expect(container.textContent).toContain("120 citations");
    expect(container.textContent).toContain(`${PAGE_SIZE} affichées sur 120`);

    await act(async () => more()!.click());
    expect(cards()).toBe(2 * PAGE_SIZE);
    await act(async () => more()!.click());
    expect(cards()).toBe(120);
    expect(more()).toBeUndefined();
  });

  it("tranches coupées dans l'ordre des sections : les citations révélées apparaissent après la dernière section affichée", async () => {
    await render(Array.from({ length: 120 }, (_, i) => highlight(i)));
    const texts = () => [...container.querySelectorAll("blockquote")].map((b) => b.textContent);
    const sections = () => [...container.querySelectorAll("section")].map((s) => s.getAttribute("aria-label"));
    const before = texts();
    const sectionsBefore = sections();
    await act(async () => more()!.click());
    // Les 50 premières citations restent en tête, dans le même ordre : rien ne s'insère au-dessus du bouton.
    expect(texts().slice(0, PAGE_SIZE)).toEqual(before);
    // Les sections déjà affichées sont complètes, sauf la dernière, que la tranche suivante prolonge.
    expect(sections().slice(0, sectionsBefore.length)).toEqual(sectionsBefore);
    const complete = sectionsBefore.slice(0, -1);
    for (const title of complete) {
      const n = Number(title!.split(" ")[1]);
      const expected = Array.from({ length: 120 }, (_, i) => i).filter((i) => (i % 7) + 1 === n).length;
      expect(container.querySelector(`section[aria-label="${title}"]`)!.querySelectorAll("blockquote").length).toBe(expected);
    }
  });

  it("« Afficher plus » : focus sur la première citation révélée, compteur annoncé (role=status)", async () => {
    await render(Array.from({ length: 120 }, (_, i) => highlight(i)));
    expect(container.querySelector('[role="status"]')?.textContent).toBe(`${PAGE_SIZE} affichées sur 120`);
    const button = more()!;
    button.focus();
    await act(async () => button.click());
    const items = container.querySelectorAll("section > ul > li");
    expect(document.activeElement).toBe(items[PAGE_SIZE]);
    expect(items[PAGE_SIZE].getAttribute("tabindex")).toBe("-1");
    expect(container.querySelector('[role="status"]')?.textContent).toBe(`${2 * PAGE_SIZE} affichées sur 120`);
  });

  it("sans bouton quand tout tient dans une tranche", async () => {
    await render(Array.from({ length: 10 }, (_, i) => highlight(i)));
    expect(cards()).toBe(10);
    expect(more()).toBeUndefined();
  });
});
