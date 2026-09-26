import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeSnapshot, makeWork } from "../fixtures";

/**
 * Gardes de la route d'écriture d'une note, sans base : session et stockage sont simulés.
 * Modèle pour les autres routes d'écriture (favoris, listes, surlignages, retours).
 */
const user = { uid: "u1", email: null, name: null, picture: null };
const auth = vi.hoisted(() => {
  const a = { getCurrentUser: vi.fn(), getCurrentUserStrict: vi.fn(), requireStrictUser: vi.fn() };
  // Garde des écritures : même contrat que lib/auth (une seule lecture stricte, 401 sans utilisateur).
  a.requireStrictUser.mockImplementation(async () => {
    const user = await a.getCurrentUserStrict();
    return user ? { ok: true, user, refused: null } : { ok: false, user: null, refused: Response.json({ error: "Non connecté." }, { status: 401 }) };
  });
  return a;
});
const notes = vi.hoisted(() => ({ getNote: vi.fn(), setNote: vi.fn(), NotesLimitError: class NotesLimitError extends Error {} }));
const openalex = vi.hoisted(() => ({ getWork: vi.fn() }));
vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/notes", () => notes);
// L'instantané d'article est rechargé depuis OpenAlex (SEC-06) : simulé, jamais le vrai service.
vi.mock("@/lib/openalex", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/openalex")>()), getWork: openalex.getWork }));

const { PUT } = await import("@/app/api/notes/[workId]/route");

function put(workId: string, body: unknown, headers: Record<string, string> = {}) {
  const req = new Request(`https://sextant.test/api/notes/${workId}`, {
    method: "PUT",
    headers: { "content-type": "application/json", origin: "https://sextant.test", host: "sextant.test", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return PUT(req, { params: Promise.resolve({ workId }) });
}

describe("PUT /api/notes/[workId]", () => {
  let n = 0;
  beforeEach(() => {
    vi.clearAllMocks();
    // Un utilisateur différent par test : la limite de débit (en mémoire) ne déborde pas d'un test à l'autre.
    auth.getCurrentUserStrict.mockResolvedValue({ ...user, uid: `u${++n}` });
    notes.setNote.mockImplementation(async (_uid: string, article: unknown, text: string) => ({ workId: "W4200000001", text, article, updatedAt: null }));
    openalex.getWork.mockResolvedValue(makeWork());
  });

  it("enregistre une note nettoyée pour l'utilisateur connecté", async () => {
    const res = await put("W4200000001", { text: "  Idée\u0000 clé \n\n\n\nsuite ", article: makeSnapshot() });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(notes.setNote).toHaveBeenCalledWith(`u${n}`, expect.objectContaining({ id: "W4200000001", title: "Open access and citation advantage" }), "Idée clé \n\nsuite", true);
  });

  it("OpenAlex en panne : instantané du client passé comme non vérifié (il n'écrase pas celui d'une note existante)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    openalex.getWork.mockRejectedValue(new Error("504"));
    const res = await put("W4200000001", { text: "x", article: makeSnapshot({ title: "Titre du client" }) });
    expect(res.status).toBe(200);
    expect(notes.setNote.mock.calls[0][3]).toBe(false);
  });

  it("stocke l'instantané d'OpenAlex, pas le titre envoyé par le client (SEC-06)", async () => {
    const res = await put("W4200000001", { text: "x", article: makeSnapshot({ title: "Titre inventé", venue: "Revue imaginaire" }) });
    expect(res.status).toBe(200);
    expect(notes.setNote.mock.calls[0][1]).toMatchObject({ title: "Open access and citation advantage", venue: "PeerJ" });
  });

  it("404 pour un article inconnu d'OpenAlex, rien n'est stocké", async () => {
    openalex.getWork.mockResolvedValue(null);
    expect((await put("W4200000001", { text: "x", article: makeSnapshot() })).status).toBe(404);
    expect(notes.setNote).not.toHaveBeenCalled();
  });

  it("refuse une requête d'un autre site avant même de lire la session", async () => {
    const res = await put("W4200000001", { text: "x", article: makeSnapshot() }, { origin: "https://attaquant.test" });
    expect(res.status).toBe(403);
    expect(auth.getCurrentUserStrict).not.toHaveBeenCalled();
    expect(notes.setNote).not.toHaveBeenCalled();
  });

  it("refuse un corps annoncé trop gros", async () => {
    const res = await put("W4200000001", { text: "x", article: makeSnapshot() }, { "content-length": "40000" });
    expect(res.status).toBe(413);
  });

  it("plafond de notes atteint : 409 avec le message, pas une panne (502)", async () => {
    notes.setNote.mockRejectedValue(new notes.NotesLimitError("Limite de 2000 notes atteinte."));
    const res = await put("W4200000001", { text: "x", article: makeSnapshot() });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Limite de 2000 notes atteinte." });
  });

  it("401 sans session", async () => {
    auth.getCurrentUserStrict.mockResolvedValue(null);
    expect((await put("W4200000001", { text: "x", article: makeSnapshot() })).status).toBe(401);
  });

  it.each([
    ["identifiant d'article invalide", "users", { text: "x", article: makeSnapshot() }],
    ["corps illisible", "W4200000001", "{pas du json"],
    ["corps tableau", "W4200000001", [1, 2]],
    ["texte absent", "W4200000001", { article: makeSnapshot() }],
    ["note trop longue", "W4200000001", { text: "a".repeat(4001), article: makeSnapshot() }],
    ["article d'un autre identifiant", "W4200000001", { text: "x", article: makeSnapshot({ id: "W9" }) }],
    ["article invalide", "W4200000001", { text: "x", article: { id: "W4200000001" } }],
  ])("400 : %s", async (_label, workId, body) => {
    const res = await put(workId, body);
    expect(res.status).toBe(400);
    expect(notes.setNote).not.toHaveBeenCalled();
  });

  it("429 au-delà de 90 écritures par minute pour un même utilisateur", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 91; i++) statuses.push((await put("W4200000001", { text: "x", article: makeSnapshot() })).status);
    expect(statuses.slice(0, 90).every((s) => s === 200)).toBe(true);
    expect(statuses[90]).toBe(429);
  });

  it("502 sans détail quand le stockage échoue", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    notes.setNote.mockRejectedValue(new Error("users/u1/notes : PERMISSION_DENIED"));
    const res = await put("W4200000001", { text: "x", article: makeSnapshot() });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "L'enregistrement a échoué." });
  });
});
