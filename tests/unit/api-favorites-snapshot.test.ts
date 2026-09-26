import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeSnapshot, makeWork } from "../fixtures";

/**
 * SEC-06 : l'instantané d'un favori est reconstruit depuis OpenAlex, jamais repris du client. Session, OpenAlex et
 * stockage sont simulés (aucune requête vers la base ni vers OpenAlex).
 */
const auth = vi.hoisted(() => {
  const a = { getCurrentUser: vi.fn(), getCurrentUserStrict: vi.fn(), requireStrictUser: vi.fn() };
  // Garde des écritures : même contrat que lib/auth (une seule lecture stricte, 401 sans utilisateur).
  a.requireStrictUser.mockImplementation(async () => {
    const user = await a.getCurrentUserStrict();
    return user ? { ok: true, user, refused: null } : { ok: false, user: null, refused: Response.json({ error: "Non connecté." }, { status: 401 }) };
  });
  return a;
});
const openalex = vi.hoisted(() => ({ getWork: vi.fn() }));
const store = vi.hoisted(() => ({ addFavorite: vi.fn(), addToCollection: vi.fn(), storedCheck: vi.fn() }));

vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/openalex", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/openalex")>()), getWork: openalex.getWork }));
vi.mock("@/lib/favorites", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/favorites")>()), addFavorite: store.addFavorite, storedCheck: store.storedCheck }));
vi.mock("@/lib/collections", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/collections")>()), addToCollection: store.addToCollection }));

const { checkSnapshot, verifiedSnapshot } = await import("@/lib/favorites");
const favoritesRoute = await import("@/app/api/favorites/route");
const collectionItemsRoute = await import("@/app/api/collections/[id]/articles/route");

const forged = makeSnapshot({
  title: "Titre inventé‮ par une liste partagée",
  authors: "Faux Auteur",
  authorNames: ["Faux Auteur"],
  venue: "Revue imaginaire",
  citedByCount: 999_999,
});

function post(url: string, body: unknown) {
  return new Request(`https://sextant.test${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://sextant.test", host: "sextant.test" },
    body: JSON.stringify(body),
  });
}

let n = 0;
beforeEach(() => {
  vi.clearAllMocks();
  auth.getCurrentUserStrict.mockResolvedValue({ uid: `u${++n}`, email: null, name: null, picture: null, authTime: 0 });
  store.addFavorite.mockImplementation(async (_uid: string, s: unknown) => s);
  store.addToCollection.mockImplementation(async (_uid: string, _id: string, s: unknown) => ({ article: s }));
  // Aucun instantané déjà stocké, sauf mention contraire.
  store.storedCheck.mockResolvedValue(null);
});

describe("verifiedSnapshot", () => {
  it("reprend les métadonnées d'OpenAlex, pas celles du client, et garde l'identifiant demandé", async () => {
    openalex.getWork.mockResolvedValue(makeWork({ id: "https://openalex.org/W999" }));
    const out = await verifiedSnapshot(forged);
    expect(out).toMatchObject({ id: forged.id, title: "Open access and citation advantage", authorNames: ["Heather Piwowar", "Jason Priem"], venue: "PeerJ", citedByCount: 1200 });
  });

  it("null pour un article inconnu d'OpenAlex", async () => {
    openalex.getWork.mockResolvedValue(null);
    await expect(verifiedSnapshot(forged)).resolves.toBeNull();
  });

  it("checkSnapshot : vérifié quand OpenAlex répond, non vérifié quand il est en panne", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    openalex.getWork.mockResolvedValue(makeWork());
    await expect(checkSnapshot(forged)).resolves.toMatchObject({ verified: true, snapshot: { title: "Open access and citation advantage" } });
    openalex.getWork.mockRejectedValue(Object.assign(new Error("Too Many Requests"), { status: 429 }));
    await expect(checkSnapshot(forged)).resolves.toEqual({ snapshot: forged, verified: false });
  });

  it("OpenAlex en panne : l'instantané du client (déjà nettoyé), la panne est journalisée", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    openalex.getWork.mockRejectedValue(new Error("504"));
    await expect(verifiedSnapshot(forged)).resolves.toBe(forged);
    expect(log).toHaveBeenCalled();
  });

  it("nettoie aussi ce qui vient d'OpenAlex (caractères bidi)", async () => {
    openalex.getWork.mockResolvedValue(makeWork({ title: "Titre‮ piégé", display_name: "x" }));
    expect((await verifiedSnapshot(forged))?.title).toBe("Titre piégé");
  });

  it("titre OpenAlex vide ou illisible : « Sans titre », jamais le titre du client", async () => {
    openalex.getWork.mockResolvedValue(makeWork({ title: "", display_name: "" }));
    await expect(verifiedSnapshot(forged)).resolves.toMatchObject({ id: forged.id, title: "Sans titre", venue: "PeerJ" });
    openalex.getWork.mockResolvedValue(makeWork({ title: "\u0000\u202e", display_name: null }));
    await expect(verifiedSnapshot(forged)).resolves.toMatchObject({ title: "Sans titre" });
  });
});

describe("routes d'ajout : l'instantané stocké vient d'OpenAlex", () => {
  it("POST /api/favorites stocke l'instantané reconstruit", async () => {
    openalex.getWork.mockResolvedValue(makeWork());
    const res = await favoritesRoute.POST(post("/api/favorites", forged));
    expect(res.status).toBe(201);
    const stored = store.addFavorite.mock.calls[0][1];
    expect(stored.title).toBe("Open access and citation advantage");
    expect(stored.venue).toBe("PeerJ");
  });

  it("POST /api/favorites : 404 pour un article inconnu, rien n'est stocké", async () => {
    openalex.getWork.mockResolvedValue(null);
    const res = await favoritesRoute.POST(post("/api/favorites", forged));
    expect(res.status).toBe(404);
    expect(store.addFavorite).not.toHaveBeenCalled();
  });

  it("OpenAlex en panne : l'instantané du client est passé comme non vérifié (il n'écrasera pas un favori existant)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    openalex.getWork.mockRejectedValue(new Error("504"));
    expect((await favoritesRoute.POST(post("/api/favorites", forged))).status).toBe(201);
    expect(store.addFavorite.mock.calls[0][2]).toBe(false);
    const res = await collectionItemsRoute.POST(post("/api/collections/liste1/articles", forged), { params: Promise.resolve({ id: "liste1" }) });
    expect(res.status).toBe(201);
    expect(store.addToCollection.mock.calls[0][3]).toBe(false);
  });

  it("article disparu d'OpenAlex mais déjà connu (favori stocké, ou retiré à l'instant) : instantané stocké, non réécrit", async () => {
    openalex.getWork.mockResolvedValue(null);
    const stored = { ...forged, title: "Titre stocké" };
    store.storedCheck.mockResolvedValue({ snapshot: stored, verified: false });
    const res = await collectionItemsRoute.POST(post("/api/collections/liste1/articles", forged), { params: Promise.resolve({ id: "liste1" }) });
    expect(res.status).toBe(201);
    expect(store.addToCollection).toHaveBeenCalledWith(`u${n}`, "liste1", stored, false);
    // « Annuler » après un retrait : POST /api/favorites rétablit l'instantané gardé.
    expect((await favoritesRoute.POST(post("/api/favorites", forged))).status).toBe(201);
    expect(store.addFavorite).toHaveBeenCalledWith(`u${n}`, stored, false);
    expect(store.storedCheck).toHaveBeenCalledWith(`u${n}`, forged.id);
  });

  it("POST /api/collections/[id]/articles stocke l'instantané reconstruit", async () => {
    openalex.getWork.mockResolvedValue(makeWork());
    const res = await collectionItemsRoute.POST(post("/api/collections/liste1/articles", forged), { params: Promise.resolve({ id: "liste1" }) });
    expect(res.status).toBe(201);
    expect(store.addToCollection.mock.calls[0][2].title).toBe("Open access and citation advantage");
  });
});
