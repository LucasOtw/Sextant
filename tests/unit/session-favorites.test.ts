// @vitest-environment happy-dom
import { act, createElement, useEffect, useLayoutEffect, type ComponentType, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Identité côté client (PERF-01) et chargement des favoris et des listes (PERF-10) : SessionProvider et
 * FavoritesProvider rendus pour de vrai (React, happy-dom), réseau simulé. Aucune requête ne part.
 */
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const { SessionProvider, useSession } = await import("@/components/auth/session-provider");
const { FavoritesProvider, useFavorites } = await import("@/components/favorites/favorites-provider");

type Session = ReturnType<typeof useSession>;
type Favorites = ReturnType<typeof useFavorites>;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const USER = { uid: "u1", name: "Ada", email: "ada@exemple.fr", picture: null };
const LIST = { id: "l1", name: "Mémoire", description: "", articleIds: ["W1"], shareToken: null, createdAt: null };

let root: Root | null = null;
let container: HTMLDivElement;
const seen: { session?: Session; favorites?: Favorites } = {};

function Probe({ onMount }: { onMount?: (f: Favorites) => void }) {
  const session = useSession();
  const favorites = useFavorites();
  // Dernier état rendu, lu par les tests.
  useEffect(() => {
    seen.session = session;
    seen.favorites = favorites;
  });
  useEffect(() => {
    onMount?.(favorites);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une fois
  }, []);
  return null;
}

async function mount(children: ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    // Enfants passés en arguments de createElement : les types des fournisseurs les déclarent obligatoires dans les props.
    const Session = SessionProvider as ComponentType<{ enabled: boolean; children?: ReactNode }>;
    const Favorites = FavoritesProvider as ComponentType<{ children?: ReactNode }>;
    root!.render(createElement(Session, { enabled: true }, createElement(Favorites, null, children)));
  });
  await settle();
}

async function settle() {
  for (let i = 0; i < 5; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const clearCookie = () => {
  document.cookie = "sextant_signed_in=; Max-Age=0; path=/";
};

describe("session côté client et favoris (PERF-01, PERF-10)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearCookie();
    fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/favorites") return json({ user: USER, ids: ["W1"], count: 1 });
      if (url === "/api/favorites?collections=1") return json({ user: USER, ids: ["W1"], count: 1, collections: [LIST] });
      if (url === "/api/collections") return json({ collections: [LIST] });
      throw new Error(`inattendu : ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(async () => {
    await act(async () => root?.unmount());
    root = null;
    container?.remove();
    clearCookie();
  });

  const urls = () => fetchMock.mock.calls.map((c) => c[0] as string);

  it("anonyme (sans indice) : aucune requête, favoris désactivés", async () => {
    await mount(createElement(Probe));
    expect(seen.session?.status).toBe("anonymous");
    expect(seen.favorites?.enabled).toBe(false);
    expect(seen.favorites?.pending).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("connecté d'après l'indice : une requête donne à la fois l'identité et les favoris", async () => {
    document.cookie = "sextant_signed_in=1; path=/";
    await mount(createElement(Probe));
    expect(urls()).toEqual(["/api/favorites"]);
    expect(seen.session?.status).toBe("signed-in");
    expect(seen.session?.user).toEqual(USER);
    expect(seen.favorites?.ready).toBe(true);
    expect(seen.favorites?.has("W1")).toBe(true);
  });

  it("indice resté après la fin de la session : 401, retour en anonyme (l'indice est remplacé par la réponse)", async () => {
    document.cookie = "sextant_signed_in=1; path=/";
    fetchMock.mockImplementation(async () => json({ error: "Non connecté." }, 401));
    await mount(createElement(Probe));
    expect(seen.session?.status).toBe("anonymous");
    expect(seen.favorites?.enabled).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("marque « session refusée » (0) : traitée comme anonyme, sans requête", async () => {
    document.cookie = "sextant_signed_in=0; path=/";
    await mount(createElement(Probe));
    expect(seen.session?.status).toBe("anonymous");
    expect(fetchMock).not.toHaveBeenCalled();
    document.cookie = "sextant_signed_in=; Max-Age=0; path=/";
  });

  it("identité servie même quand Firestore échoue (502) : l'en-tête montre le compte", async () => {
    document.cookie = "sextant_signed_in=1; path=/";
    fetchMock.mockImplementation(async () => json({ error: "Favoris indisponibles.", user: USER }, 502));
    await mount(createElement(Probe));
    expect(seen.session?.user).toEqual(USER);
    expect(seen.favorites?.error).toBe(true);
  });

  it("déconnexion : état vidé aussitôt, indice effacé", async () => {
    document.cookie = "sextant_signed_in=1; path=/";
    await mount(createElement(Probe));
    await act(async () => seen.session?.signedOut());
    expect(seen.session?.status).toBe("anonymous");
    expect(seen.favorites?.count).toBe(0);
    expect(document.cookie).not.toContain("sextant_signed_in=1");
  });

  it("connexion : identité de la réponse, favoris chargés pour la nouvelle session", async () => {
    await mount(createElement(Probe));
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => seen.session?.signedIn(USER));
    await settle();
    expect(seen.session?.user).toEqual(USER);
    expect(urls()).toEqual(["/api/favorites"]);
    expect(seen.favorites?.has("W1")).toBe(true);
  });

  it("listes demandées pendant un chargement parti sans elles : lues en parallèle, sans tout relancer (PERF-10)", async () => {
    document.cookie = "sextant_signed_in=1; path=/";
    let release: () => void = () => undefined;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/favorites") {
        await new Promise<void>((r) => (release = r));
        return json({ user: USER, ids: ["W1"], count: 1 });
      }
      if (url === "/api/collections") return json({ collections: [LIST] });
      throw new Error(`inattendu : ${url}`);
    });
    await mount(createElement(Probe));
    // Le sélecteur de listes s'hydrate après le fournisseur (frontière Suspense) : la requête des favoris est en cours.
    await act(async () => void seen.favorites?.loadCollections());
    release();
    await settle();
    expect(urls()).toEqual(["/api/favorites", "/api/collections"]);
    expect(seen.favorites?.collectionsLoaded).toBe(true);
    expect(seen.favorites?.listsOf("W1").map((c) => c.id)).toEqual(["l1"]);
  });

  it("listes déjà lues par le serveur de /favoris : aucune relecture côté client (PERF-10)", async () => {
    document.cookie = "sextant_signed_in=1; path=/";
    function Seeded() {
      const favorites = useFavorites();
      const { loadCollections } = favorites;
      useLayoutEffect(() => {
        void loadCollections([LIST], { fresh: true });
      }, [loadCollections]);
      return null;
    }
    await mount([createElement(Seeded, { key: "s" }), createElement(Probe, { key: "p", onMount: (f) => void f.loadCollections() })]);
    expect(urls()).toEqual(["/api/favorites"]);
    expect(seen.favorites?.collectionsLoaded).toBe(true);
    expect(seen.favorites?.collections.map((c) => c.id)).toEqual(["l1"]);
  });
});
