// @vitest-environment happy-dom
import { act, createContext, createElement, useContext, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Collection } from "@/lib/collections-shared";
import type { Favorite } from "@/lib/favorites-shared";
import { PAGE_SIZE } from "@/lib/list-filter";
import { makeSnapshot } from "../fixtures";

/**
 * Réordonnancement au clavier d'une liste de plus de 50 articles (PERF-11) : la carte descendue depuis le bas de la
 * tranche reste affichée et garde le focus. Fournisseur des favoris simulé (état local, sans réseau).
 */
vi.mock("next/navigation", () => ({ usePathname: () => "/favoris", useSearchParams: () => new URLSearchParams("liste=l1") }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
// Sélecteur de listes et cœur : hors sujet ici (ils lisent tout le contexte).
vi.mock("@/components/collections/collection-picker", () => ({ CollectionPicker: () => null }));
vi.mock("@/components/favorites/favorite-button", () => ({ FavoriteButton: () => null }));

const N = 60;
const favorites: Favorite[] = Array.from({ length: N }, (_, i) => ({ ...makeSnapshot({ id: `W${i + 1}`, title: `Article ${i + 1}` }), addedAt: null }));
const initialList: Collection = { id: "l1", name: "Thèse", description: "", articleIds: favorites.map((f) => f.id), shareToken: null, createdAt: null } as Collection;

// Contexte propre au test : le composant lit l'état simulé comme il lirait celui du vrai fournisseur.
const FakeFavorites = createContext<unknown>(null);
vi.mock("@/components/favorites/favorites-provider", () => ({ useFavorites: () => useContext(FakeFavorites) }));

const { FavoritesList } = await import("@/components/favorites/favorites-list");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Fournisseur minimal : listes en état local, mises à jour optimistes comme le vrai. */
function Harness() {
  const [collections, setCollections] = useState<Collection[]>([initialList]);
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
    updateCollection: async (id: string, patch: Partial<Collection>) => {
      setCollections((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
      return true;
    },
  };
  return createElement(FakeFavorites.Provider, { value }, createElement(FavoritesList, { initial: favorites, initialCollections: [initialList], collectionsFresh: true }));
}

let root: Root | null = null;
let container: HTMLDivElement;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  container?.remove();
});

describe("FavoritesList : « Descendre » sur la dernière carte de la tranche", () => {
  it("la tranche s'agrandit, la carte déplacée reste affichée et garde le focus", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root!.render(createElement(Harness)));
    const rows = () => [...container.querySelectorAll<HTMLLIElement>("ul > li[data-id]")];
    expect(rows()).toHaveLength(PAGE_SIZE);

    const last = rows()[PAGE_SIZE - 1];
    expect(last.dataset.id).toBe(`W${PAGE_SIZE}`);
    const down = last.querySelector<HTMLButtonElement>('button[data-move="down"]')!;
    down.focus();
    await act(async () => down.click());

    const after = rows();
    expect(after.length).toBeGreaterThan(PAGE_SIZE);
    expect(after[PAGE_SIZE].dataset.id).toBe(`W${PAGE_SIZE}`);
    expect(after[PAGE_SIZE - 1].dataset.id).toBe(`W${PAGE_SIZE + 1}`);
    expect(after[PAGE_SIZE].contains(document.activeElement)).toBe(true);
  });
});
