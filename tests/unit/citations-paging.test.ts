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
    expect(container.textContent).toContain(`${PAGE_SIZE} affichés sur 120`);

    await act(async () => more()!.click());
    expect(cards()).toBe(2 * PAGE_SIZE);
    await act(async () => more()!.click());
    expect(cards()).toBe(120);
    expect(more()).toBeUndefined();
  });

  it("sans bouton quand tout tient dans une tranche", async () => {
    await render(Array.from({ length: 10 }, (_, i) => highlight(i)));
    expect(cards()).toBe(10);
    expect(more()).toBeUndefined();
  });
});
