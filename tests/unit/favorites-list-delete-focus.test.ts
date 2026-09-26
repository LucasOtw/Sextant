// @vitest-environment happy-dom
import { act, createContext, createElement, useContext, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Collection } from "@/lib/collections-shared";
import type { Favorite } from "@/lib/favorites-shared";
import { makeSnapshot } from "../fixtures";

/**
 * Suppression d'une liste depuis /favoris (A11Y-19) : l'en-tête qui portait « Gérer » disparaît avec la liste ; la
 * fenêtre de confirmation rend le focus au compteur d'articles, pas à <body>.
 */
const nav = vi.hoisted(() => ({ query: "liste=l1" }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/favoris",
  useSearchParams: () => new URLSearchParams(nav.query),
  useRouter: () => ({ replace: (href: string) => (nav.query = href.split("?")[1] ?? ""), push: () => undefined }),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/components/collections/collection-picker", () => ({ CollectionPicker: () => null }));
vi.mock("@/components/favorites/favorite-button", () => ({ FavoriteButton: () => null }));

const favorites: Favorite[] = [1, 2].map((i) => ({ ...makeSnapshot({ id: `W${i}`, title: `Article ${i}` }), addedAt: null }));
const list: Collection = { id: "l1", name: "Thèse", description: "", articleIds: ["W1"], shareToken: null, createdAt: null } as Collection;

const FakeFavorites = createContext<unknown>(null);
vi.mock("@/components/favorites/favorites-provider", () => ({ useFavorites: () => useContext(FakeFavorites) }));

const { FavoritesList } = await import("@/components/favorites/favorites-list");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness() {
  const [collections, setCollections] = useState<Collection[]>([list]);
  const value = {
    ready: true,
    error: false,
    has: () => true,
    added: [],
    collections,
    collectionsLoaded: true,
    loadCollections: async () => undefined,
    listsOf: () => [],
    refresh: async () => null,
    deleteCollection: async (id: string) => {
      setCollections((prev) => prev.filter((c) => c.id !== id));
      return true;
    },
  };
  return createElement(FakeFavorites.Provider, { value }, createElement(FavoritesList, { initial: favorites, initialCollections: [list], collectionsFresh: true }));
}

let root: Root | null = null;
let container: HTMLDivElement;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  container?.remove();
});

const wait = (ms: number) => act(async () => new Promise((r) => setTimeout(r, ms)));
const byText = (text: string) => [...document.querySelectorAll<HTMLElement>("button, [role=menuitem]")].find((b) => b.textContent?.includes(text));

describe("FavoritesList : suppression d'une liste", () => {
  it("après « Supprimer la liste », le focus va au compteur d'articles, pas à <body>", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root!.render(createElement(Harness)));
    const manage = container.querySelector<HTMLButtonElement>('[aria-label="Gérer la liste Thèse"]')!;
    manage.focus();
    await act(async () => manage.click());
    await wait(50);
    await act(async () => byText("Supprimer la liste")!.click());
    await wait(50);
    const confirm = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((b) => b.textContent?.includes("Supprimer la liste"))!;
    await act(async () => confirm.click());
    await wait(400);
    expect(container.querySelector('[aria-label="Gérer la liste Thèse"]')).toBeNull();
    expect(document.activeElement?.textContent).toMatch(/^2 articles/);
  });
});
