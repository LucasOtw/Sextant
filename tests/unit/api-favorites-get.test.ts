import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * GET /api/favorites porte l'identité de l'en-tête (PERF-01) et tient à jour l'indice de connexion lisible par le
 * navigateur. Session et stockage simulés : aucune requête vers la base.
 */
const auth = vi.hoisted(() => ({ getCurrentUser: vi.fn(), getCurrentUserStrict: vi.fn() }));
const store = vi.hoisted(() => ({ listFavoriteIds: vi.fn(), listCollections: vi.fn() }));
vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/favorites", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/favorites")>()), listFavoriteIds: store.listFavoriteIds }));
vi.mock("@/lib/collections", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/collections")>()), listCollections: store.listCollections }));
vi.mock("@/lib/log", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/log")>()), logError: vi.fn() }));

const { GET } = await import("@/app/api/favorites/route");

const get = (cookie?: string, query = "") => GET(new Request(`https://sextant.test/api/favorites${query}`, { headers: cookie ? { cookie } : {} }));
const hint = (res: Response) => res.headers.getSetCookie().find((c) => c.startsWith("sextant_signed_in="));

let n = 0;
beforeEach(() => {
  vi.clearAllMocks();
  store.listFavoriteIds.mockResolvedValue(["W1"]);
  store.listCollections.mockResolvedValue([]);
});

describe("GET /api/favorites : identité et indice de connexion", () => {
  it("connecté : identité réduite à quatre champs, jamais mise en cache", async () => {
    auth.getCurrentUser.mockResolvedValue({ uid: `u${++n}`, email: "a@b.fr", name: "Ada", picture: null, authTime: 123 });
    const res = await get("sextant_session=x; sextant_signed_in=1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: Record<string, unknown>; ids: string[] };
    expect(body.user).toEqual({ uid: `u${n}`, email: "a@b.fr", name: "Ada", picture: null });
    expect(body.ids).toEqual(["W1"]);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(hint(res)).toBeUndefined();
  });

  it("Firestore en panne : 502, mais l'identité reste servie", async () => {
    auth.getCurrentUser.mockResolvedValue({ uid: `u${++n}`, email: null, name: "Ada", picture: null, authTime: 0 });
    store.listFavoriteIds.mockRejectedValue(new Error("panne"));
    const res = await get("sextant_session=x");
    expect(res.status).toBe(502);
    expect(((await res.json()) as { user: { name: string } }).user.name).toBe("Ada");
  });

  it("cookie de session refusé : 401 et indice marqué « refusé » pour une heure (pas de boucle avec le proxy)", async () => {
    auth.getCurrentUser.mockResolvedValue(null);
    const res = await get("sextant_session=revoque; sextant_signed_in=1");
    expect(res.status).toBe(401);
    expect(hint(res)).toMatch(/^sextant_signed_in=0;.*Max-Age=3600/i);
  });

  it("sans cookie de session : indice effacé s'il traîne, rien sinon", async () => {
    auth.getCurrentUser.mockResolvedValue(null);
    expect(hint(await get("sextant_signed_in=1"))).toMatch(/^sextant_signed_in=;.*Max-Age=0/i);
    expect(hint(await get())).toBeUndefined();
  });
});
