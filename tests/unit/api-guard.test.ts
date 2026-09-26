import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ getCurrentUser: vi.fn(), requireStrictUser: vi.fn() }));
vi.mock("@/lib/auth", () => auth);
const log = vi.hoisted(() => ({ logError: vi.fn() }));
vi.mock("@/lib/log", () => log);

import { overLimit, PRIVATE, RATE_LIMITS, requireUser, serverError, tooMany } from "@/lib/api/guard";
import { rateLimit } from "@/lib/rate-limit";

const user = { uid: "u-guard", email: "a@exemple.org", name: "A", picture: null, authTime: 0 };
const denied = Response.json({ error: "Non connecté." }, { status: 401 });

/** Requête d'écriture du même site, corps annoncé de `length` octets. */
function write(length = 10, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/x", {
    method: "POST",
    headers: { host: "localhost:3000", origin, "content-length": String(length), "sec-fetch-site": origin.includes("localhost") ? "same-origin" : "cross-site" },
  });
}

let n = 0;
beforeEach(() => {
  auth.getCurrentUser.mockReset();
  auth.requireStrictUser.mockReset();
  // Un uid neuf par test : les compteurs de débit (en mémoire, par instance) ne se mélangent pas.
  const u = { ...user, uid: `u-guard-${n++}` };
  auth.getCurrentUser.mockResolvedValue(u);
  auth.requireStrictUser.mockResolvedValue({ ok: true, user: u, refused: null });
});

describe("garde commune des routes API (QUAL-05)", () => {
  it("écriture : autre site 403, avant toute lecture de session", async () => {
    const g = await requireUser(write(10, "https://ailleurs.example"), { bucket: "favorites" });
    expect(g.refused?.status).toBe(403);
    expect(auth.requireStrictUser).not.toHaveBeenCalled();
  });

  it("écriture : corps annoncé trop gros 413 ; sans maxBody, le corps n'est pas contrôlé", async () => {
    expect((await requireUser(write(40_000), { maxBody: 32_768 })).refused?.status).toBe(413);
    expect((await requireUser(write(40_000))).refused).toBeNull();
  });

  it("écriture : session stricte, avec le message de connexion demandé ; son refus est renvoyé tel quel", async () => {
    auth.requireStrictUser.mockResolvedValue({ ok: false, user: null, refused: denied });
    const g = await requireUser(write(), { signInMessage: "Connectez-vous pour voter." });
    expect(g.refused).toBe(denied);
    expect(auth.requireStrictUser).toHaveBeenCalledWith("Connectez-vous pour voter.");
    expect(auth.getCurrentUser).not.toHaveBeenCalled();
  });

  it("lecture : session non stricte, 401 « Non connecté. » sans utilisateur, ni contrôle d'origine", async () => {
    auth.getCurrentUser.mockResolvedValue(null);
    const g = await requireUser(write(40_000, "https://ailleurs.example"), { read: true, maxBody: 10 });
    expect(g.refused?.status).toBe(401);
    expect(await g.refused?.json()).toEqual({ error: "Non connecté." });
    expect(auth.requireStrictUser).not.toHaveBeenCalled();
  });

  it("export : GET strict sans contrôle d'origine", async () => {
    const g = await requireUser(write(10, "https://ailleurs.example"), { crossSiteAllowed: true });
    expect(g.user).not.toBeNull();
  });

  it("limite du seau, comptée par compte : 429 au-delà, avec le message demandé", async () => {
    const req = () => write();
    for (let i = 0; i < RATE_LIMITS.keys.limit; i++) expect((await requireUser(req(), { bucket: "keys" })).refused).toBeNull();
    const g = await requireUser(req(), { bucket: "keys", tooManyMessage: "Doucement." });
    expect(g.refused?.status).toBe(429);
    expect(await g.refused?.json()).toEqual({ error: "Doucement." });
  });

  it("overLimit compte sous la clé historique `<seau>:<clé>` (mêmes compteurs qu'avant la factorisation)", () => {
    for (let i = 0; i < RATE_LIMITS.export.limit; i++) expect(rateLimit("export:u-compteur", 5, 60_000)).toBe(true);
    expect(overLimit("export", "u-compteur")).toBe(true);
  });

  it("limites inchangées par la factorisation", () => {
    const perMinute = Object.fromEntries(Object.entries(RATE_LIMITS).map(([k, v]) => [k, v.windowMs === 60_000 ? v.limit : `${v.limit}/${v.windowMs}`]));
    expect(perMinute).toEqual({
      collections: 60, "collections-items": 90, favorites: 90, highlights: 90, notes: 90, keys: 10, export: 5,
      "feedback-post": "5/3600000", "feedback-vote": 60, "account-del": 3, "sessions-revoke": 3, mcp: 90, "mcp-ip": 300,
      "summary-read": 60, summary: 10, pdf: 30, pdfr: 300, "pdf-head": 60, reco: 30, suggest: 120, author: 120, csp: 20,
      "page-lib": 30, "feedback-view": 120, "share-view": 120,
    });
  });

  it("tooMany et serverError : 429 et 502 au format { error }, la panne journalisée", async () => {
    expect(tooMany().status).toBe(429);
    expect(await tooMany().json()).toEqual({ error: "Trop de requêtes, réessayez dans une minute." });
    const err = new Error("firestore");
    const res = serverError("x.POST", err, "L'ajout a échoué.", { work: "W1" });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "L'ajout a échoué." });
    expect(log.logError).toHaveBeenCalledWith("x.POST", err, { work: "W1" });
    expect(PRIVATE).toEqual({ "cache-control": "private, no-store" });
  });
});
