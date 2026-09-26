import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * GET /api/favorites porte l'identité de l'en-tête (PERF-01) et tient à jour l'indice de connexion lisible par le
 * navigateur. Session et stockage simulés : aucune requête vers la base.
 */
const auth = vi.hoisted(() => ({ readSessionWithReason: vi.fn(), getCurrentUserStrict: vi.fn() }));
const store = vi.hoisted(() => ({ listFavoriteIds: vi.fn(), listCollections: vi.fn() }));
vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/favorites", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/favorites")>()), listFavoriteIds: store.listFavoriteIds }));
vi.mock("@/lib/collections", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/collections")>()), listCollections: store.listCollections }));
vi.mock("@/lib/log", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/log")>()), logError: vi.fn() }));

const { GET } = await import("@/app/api/favorites/route");

const get = (cookie?: string, query = "") => GET(new Request(`https://sextant.test/api/favorites${query}`, { headers: cookie ? { cookie } : {} }));
/** Session lue : utilisateur, refus attendu (`rejected`), panne (`unavailable`) ou absence de cookie (null). */
const session = (user: Record<string, unknown> | null, failure: "rejected" | "unavailable" | null = null) =>
  auth.readSessionWithReason.mockResolvedValue({ user, failure });
const hint = (res: Response) => res.headers.getSetCookie().find((c) => c.startsWith("sextant_signed_in="));

let n = 0;
beforeEach(() => {
  vi.clearAllMocks();
  store.listFavoriteIds.mockResolvedValue(["W1"]);
  store.listCollections.mockResolvedValue([]);
});

describe("GET /api/favorites : identité et indice de connexion", () => {
  it("connecté : identité réduite à quatre champs, jamais mise en cache", async () => {
    session({ uid: `u${++n}`, email: "a@b.fr", name: "Ada", picture: null, authTime: 123 });
    const res = await get("sextant_session=x; sextant_signed_in=1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: Record<string, unknown>; ids: string[] };
    expect(body.user).toEqual({ uid: `u${n}`, email: "a@b.fr", name: "Ada", picture: null });
    expect(body.ids).toEqual(["W1"]);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(hint(res)).toBeUndefined();
  });

  it("Firestore en panne : 502, mais l'identité reste servie", async () => {
    session({ uid: `u${++n}`, email: null, name: "Ada", picture: null, authTime: 0 });
    store.listFavoriteIds.mockRejectedValue(new Error("panne"));
    const res = await get("sextant_session=x");
    expect(res.status).toBe(502);
    expect(((await res.json()) as { user: { name: string } }).user.name).toBe("Ada");
  });

  it("cookie de session refusé : 401 et indice marqué « refusé » pour une heure (pas de boucle avec le proxy)", async () => {
    session(null, "rejected");
    const res = await get("sextant_session=revoque; sextant_signed_in=1");
    expect(res.status).toBe(401);
    expect(hint(res)).toMatch(/^sextant_signed_in=0;.*Max-Age=3600/i);
  });

  it("vérification de session en panne : 503, indice laissé tel quel (personne n'est déconnecté pour une heure)", async () => {
    session(null, "unavailable");
    const res = await get("sextant_session=x; sextant_signed_in=1");
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(hint(res)).toBeUndefined();
  });

  it("limite de débit atteinte : 429, avec l'identité pour que l'en-tête garde son menu", async () => {
    const uid = `u${++n}`;
    session({ uid, email: null, name: "Ada", picture: null, authTime: 0 });
    let res = await get("sextant_session=x");
    for (let i = 0; i < 100 && res.status !== 429; i++) res = await get("sextant_session=x");
    expect(res.status).toBe(429);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(((await res.json()) as { user: { uid: string } }).user.uid).toBe(uid);
  });

  it("sans cookie de session : indice effacé s'il traîne, rien sinon", async () => {
    session(null);
    expect(hint(await get("sextant_signed_in=1"))).toMatch(/^sextant_signed_in=;.*Max-Age=0/i);
    expect(hint(await get())).toBeUndefined();
  });
});
