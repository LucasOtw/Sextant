import { beforeEach, describe, expect, it, vi } from "vitest";
import { REAUTH_MAX_AGE_S, REAUTH_REQUIRED } from "@/lib/reauth-shared";

/**
 * Ré-authentification (SEC-09) et « déconnexion de tous les appareils » (SEC-08) : routes testées avec session,
 * Firebase Auth et stockage simulés. Aucune requête ne part vers la base.
 */
const auth = vi.hoisted(() => ({ getCurrentUserStrict: vi.fn(), getCurrentUser: vi.fn(), forgetRevocationCheck: vi.fn() }));
const admin = vi.hoisted(() => ({ revokeRefreshTokens: vi.fn(), deleteUser: vi.fn(), verifyIdToken: vi.fn(), createSessionCookie: vi.fn(), getUser: vi.fn() }));
const keys = vi.hoisted(() => ({ deleteAllKeys: vi.fn(), createKey: vi.fn(), listKeys: vi.fn() }));

vi.mock("@/lib/auth", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auth")>()), ...auth, isAuthEnabled: () => true }));
vi.mock("@/lib/firebase/admin", () => ({
  isAdminConfigured: () => true,
  adminAuth: async () => admin,
  // Profil écrit à l'ouverture de session : simulé, jamais la vraie base.
  adminDb: async () => ({ doc: () => ({ set: async () => undefined }) }),
}));
vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: () => "maintenant" }, Timestamp: { fromDate: (d: Date) => d } }));
vi.mock("@/lib/api-keys", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api-keys")>()), ...keys }));

const { isRecentLogin } = await import("@/lib/auth");
const accountRoute = await import("@/app/api/auth/account/route");
const keysRoute = await import("@/app/api/account/keys/route");
const sessionsRoute = await import("@/app/api/auth/sessions/route");
const sessionRoute = await import("@/app/api/auth/session/route");

const now = () => Math.floor(Date.now() / 1000);
let n = 0;
const sessionUser = (authAgeSec: number) => ({ uid: `u${++n}`, email: null, name: null, picture: null, authTime: now() - authAgeSec });

function req(url: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://sextant.test${url}`, {
    method,
    headers: { "content-type": "application/json", origin: "https://sextant.test", host: "sextant.test", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("isRecentLogin", () => {
  it("vrai pendant 10 minutes après la connexion Google, faux ensuite", () => {
    const t = 1_800_000_000;
    expect(isRecentLogin({ authTime: t }, REAUTH_MAX_AGE_S, t * 1000 + 60_000)).toBe(true);
    expect(isRecentLogin({ authTime: t }, REAUTH_MAX_AGE_S, (t + REAUTH_MAX_AGE_S) * 1000)).toBe(true);
    expect(isRecentLogin({ authTime: t }, REAUTH_MAX_AGE_S, (t + REAUTH_MAX_AGE_S + 1) * 1000)).toBe(false);
  });

  it("faux sans date de connexion connue", () => {
    expect(isRecentLogin({ authTime: 0 })).toBe(false);
    expect(isRecentLogin({ authTime: Number.NaN })).toBe(false);
  });
});

describe("opérations sensibles : connexion Google récente exigée", () => {
  beforeEach(() => vi.clearAllMocks());

  it("DELETE /api/auth/account : 401 reauth_required sur une session ancienne, rien n'est supprimé", async () => {
    auth.getCurrentUserStrict.mockResolvedValue(sessionUser(REAUTH_MAX_AGE_S + 60));
    const res = await accountRoute.DELETE(req("/api/auth/account", "DELETE"));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: REAUTH_REQUIRED });
    expect(keys.deleteAllKeys).not.toHaveBeenCalled();
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });

  it("POST /api/account/keys : 401 reauth_required sur une session ancienne, aucune clé créée", async () => {
    auth.getCurrentUserStrict.mockResolvedValue(sessionUser(3 * 24 * 3600));
    const res = await keysRoute.POST(req("/api/account/keys", "POST", { name: "Claude" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: REAUTH_REQUIRED });
    expect(keys.createKey).not.toHaveBeenCalled();
  });

  it("POST /api/account/keys : crée la clé sur une connexion récente", async () => {
    auth.getCurrentUserStrict.mockResolvedValue(sessionUser(30));
    keys.createKey.mockResolvedValue({ key: "sxt_x", info: { id: "a", name: "Claude", prefix: "sxt_x", createdAt: null, lastUsedAt: null } });
    const res = await keysRoute.POST(req("/api/account/keys", "POST", { name: "Claude" }));
    expect(res.status).toBe(201);
    expect(keys.createKey).toHaveBeenCalledWith(`u${n}`, "Claude");
  });

  it("DELETE /api/auth/account : limite de 3 tentatives par minute", async () => {
    const user = sessionUser(REAUTH_MAX_AGE_S + 60);
    auth.getCurrentUserStrict.mockResolvedValue(user);
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await accountRoute.DELETE(req("/api/auth/account", "DELETE"))).status);
    expect(statuses).toEqual([401, 401, 401, 429]);
  });
});

describe("DELETE /api/auth/sessions (se déconnecter de tous les appareils)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("révoque les jetons, supprime les clés MCP et efface le cookie de cet appareil, sans ré-authentification", async () => {
    auth.getCurrentUserStrict.mockResolvedValue(sessionUser(5 * 24 * 3600));
    const res = await sessionsRoute.DELETE(req("/api/auth/sessions", "DELETE"));
    expect(res.status).toBe(200);
    expect(admin.revokeRefreshTokens).toHaveBeenCalledWith(`u${n}`);
    expect(auth.forgetRevocationCheck).toHaveBeenCalledWith(`u${n}`);
    expect(keys.deleteAllKeys).toHaveBeenCalledWith(`u${n}`);
    expect(res.headers.get("set-cookie")).toMatch(/sextant_session=;.*Max-Age=0/i);
  });

  it("révoque avant de supprimer les clés", async () => {
    auth.getCurrentUserStrict.mockResolvedValue(sessionUser(60));
    const order: string[] = [];
    admin.revokeRefreshTokens.mockImplementation(async () => void order.push("revoke"));
    keys.deleteAllKeys.mockImplementation(async () => void order.push("keys"));
    await sessionsRoute.DELETE(req("/api/auth/sessions", "DELETE"));
    expect(order).toEqual(["revoke", "keys"]);
  });

  it("refuse une requête d'un autre site", async () => {
    const res = await sessionsRoute.DELETE(req("/api/auth/sessions", "DELETE", undefined, { origin: "https://attaquant.test" }));
    expect(res.status).toBe(403);
    expect(admin.revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it("401 sans session", async () => {
    auth.getCurrentUserStrict.mockResolvedValue(null);
    expect((await sessionsRoute.DELETE(req("/api/auth/sessions", "DELETE"))).status).toBe(401);
  });

  it("502 si la révocation échoue, le cookie est gardé", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    auth.getCurrentUserStrict.mockResolvedValue(sessionUser(60));
    admin.revokeRefreshTokens.mockRejectedValueOnce(new Error("panne"));
    const res = await sessionsRoute.DELETE(req("/api/auth/sessions", "DELETE"));
    expect(res.status).toBe(502);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

describe("POST /api/auth/session avec reauth (confirmation d'identité)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    admin.createSessionCookie.mockResolvedValue("cookie-neuf");
    admin.getUser.mockResolvedValue({ metadata: { creationTime: "Mon, 01 Jun 2026 08:00:00 GMT" } });
  });

  it("refuse un autre compte Google que celui de la session (403 wrong_account), sans nouveau cookie", async () => {
    auth.getCurrentUser.mockResolvedValue({ uid: "titulaire", authTime: now() - 3600 });
    admin.verifyIdToken.mockResolvedValue({ uid: "autre-compte", auth_time: now() });
    const res = await sessionRoute.POST(req("/api/auth/session", "POST", { idToken: "jeton", reauth: true }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "wrong_account" });
    expect(admin.createSessionCookie).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("refuse sans session en cours", async () => {
    auth.getCurrentUser.mockResolvedValue(null);
    admin.verifyIdToken.mockResolvedValue({ uid: "titulaire", auth_time: now() });
    expect((await sessionRoute.POST(req("/api/auth/session", "POST", { idToken: "jeton", reauth: true }))).status).toBe(401);
    expect(admin.createSessionCookie).not.toHaveBeenCalled();
  });

  it("même compte : réémet le cookie (connexion récente)", async () => {
    auth.getCurrentUser.mockResolvedValue({ uid: "titulaire", authTime: now() - 3600 });
    admin.verifyIdToken.mockResolvedValue({ uid: "titulaire", auth_time: now() });
    const res = await sessionRoute.POST(req("/api/auth/session", "POST", { idToken: "jeton", reauth: true }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/sextant_session=cookie-neuf/);
  });

  it("connexion ordinaire (sans reauth) : aucun contrôle de compte, comme avant", async () => {
    admin.verifyIdToken.mockResolvedValue({ uid: "nouveau", auth_time: now() });
    const res = await sessionRoute.POST(req("/api/auth/session", "POST", { idToken: "jeton" }));
    expect(res.status).toBe(200);
    expect(auth.getCurrentUser).not.toHaveBeenCalled();
  });
});
