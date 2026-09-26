import { beforeEach, describe, expect, it, vi } from "vitest";
import { REAUTH_MAX_AGE_S, REAUTH_REQUIRED } from "@/lib/reauth-shared";

/**
 * Ré-authentification (SEC-09) et « déconnexion de tous les appareils » (SEC-08) : routes testées avec session,
 * Firebase Auth et stockage simulés. Aucune requête ne part vers la base.
 */
const auth = vi.hoisted(() => {
  const a = {
    getCurrentUserStrict: vi.fn(),
    getCurrentUser: vi.fn(),
    forgetRevocationCheck: vi.fn(),
    // Sans utilisateur strict : 401 par défaut ; une panne de la vérification est simulée au cas par cas (503).
    strictRefusal: vi.fn(async () => Response.json({ error: "Non connecté." }, { status: 401 })),
    recheckSession: vi.fn(async () => true),
    requireStrictUser: vi.fn(),
  };
  // Garde des écritures (lib/auth) : utilisateur strict simulé, ou la réponse de refus simulée ci-dessus.
  a.requireStrictUser.mockImplementation(async () => {
    const user = await a.getCurrentUserStrict();
    return user ? { ok: true, user, refused: null } : { ok: false, user: null, refused: await a.strictRefusal() };
  });
  return a;
});
const server = vi.hoisted(() => ({ after: vi.fn() }));
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
// `after` n'existe que dans une requête Next : relevé ici, sans exécution.
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: server.after }));

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
    // Clé rattachée à la session qui la crée (auth_time) : elle tombe avec elle à la prochaine révocation.
    expect(keys.createKey).toHaveBeenCalledWith(`u${n}`, "Claude", now() - 30);
    expect(auth.recheckSession).toHaveBeenCalledWith(expect.objectContaining({ uid: `u${n}` }));
  });

  it("POST /api/account/keys : révocation faite sur une autre instance (état du compte relu) : 401, aucune clé", async () => {
    auth.getCurrentUserStrict.mockResolvedValue(sessionUser(30));
    auth.recheckSession.mockResolvedValueOnce(false);
    const res = await keysRoute.POST(req("/api/account/keys", "POST", { name: "Claude" }));
    expect(res.status).toBe(401);
    expect(keys.createKey).not.toHaveBeenCalled();
  });

  it("POST /api/account/keys : Firebase Auth injoignable à la relecture : 503, aucune clé", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    auth.getCurrentUserStrict.mockResolvedValue(sessionUser(30));
    auth.recheckSession.mockRejectedValueOnce(new Error("panne"));
    const res = await keysRoute.POST(req("/api/account/keys", "POST", { name: "Claude" }));
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("5");
    expect(keys.createKey).not.toHaveBeenCalled();
  });

  it("vérification de session en panne : 503 et non « Non connecté » (suppression du compte, clés)", async () => {
    auth.getCurrentUserStrict.mockResolvedValue(null);
    const unavailable = () => Response.json({ error: "Vérification de session momentanément impossible, réessayez." }, { status: 503 });
    auth.strictRefusal.mockImplementationOnce(async () => unavailable()).mockImplementationOnce(async () => unavailable());
    expect((await accountRoute.DELETE(req("/api/auth/account", "DELETE"))).status).toBe(503);
    expect((await keysRoute.POST(req("/api/account/keys", "POST", { name: "Claude" }))).status).toBe(503);
    expect(keys.createKey).not.toHaveBeenCalled();
    expect(admin.deleteUser).not.toHaveBeenCalled();
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

  it("révocation réussie mais suppression des clés en échec : 200 keysPending, cookie et indice effacés, nouvel essai différé", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    auth.getCurrentUserStrict.mockResolvedValue(sessionUser(60));
    keys.deleteAllKeys.mockRejectedValueOnce(new Error("Firestore"));
    const res = await sessionsRoute.DELETE(req("/api/auth/sessions", "DELETE"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, keysPending: true });
    const cookies = res.headers.getSetCookie();
    expect(cookies.find((c) => c.startsWith("sextant_session="))).toMatch(/Max-Age=0/i);
    expect(cookies.find((c) => c.startsWith("sextant_signed_in="))).toMatch(/^sextant_signed_in=;.*Max-Age=0/i);
    expect(auth.forgetRevocationCheck).toHaveBeenCalledWith(`u${n}`);
    // Nouvel essai après la réponse : il supprime les clés.
    expect(server.after).toHaveBeenCalledTimes(1);
    keys.deleteAllKeys.mockResolvedValueOnce(undefined);
    await (server.after.mock.calls[0][0] as () => Promise<void>)();
    expect(keys.deleteAllKeys).toHaveBeenCalledTimes(2);
  });

  it("vérification de session en panne : 503, pas « Non connecté »", async () => {
    auth.getCurrentUserStrict.mockResolvedValue(null);
    auth.strictRefusal.mockImplementationOnce(async () => Response.json({ error: "Vérification de session momentanément impossible, réessayez." }, { status: 503 }));
    expect((await sessionsRoute.DELETE(req("/api/auth/sessions", "DELETE"))).status).toBe(503);
    expect(admin.revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it("502 si la révocation échoue, le cookie est gardé", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    auth.getCurrentUserStrict.mockResolvedValue(sessionUser(60));
    admin.revokeRefreshTokens.mockRejectedValueOnce(new Error("panne"));
    const res = await sessionsRoute.DELETE(req("/api/auth/sessions", "DELETE"));
    expect(res.status).toBe(502);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(keys.deleteAllKeys).not.toHaveBeenCalled();
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
    admin.verifyIdToken.mockResolvedValue({ uid: "autre-compte", auth_time: now(), firebase: { sign_in_provider: "google.com" } });
    const res = await sessionRoute.POST(req("/api/auth/session", "POST", { idToken: "jeton", reauth: true }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "wrong_account" });
    expect(admin.createSessionCookie).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("refuse sans session en cours", async () => {
    auth.getCurrentUser.mockResolvedValue(null);
    admin.verifyIdToken.mockResolvedValue({ uid: "titulaire", auth_time: now(), firebase: { sign_in_provider: "google.com" } });
    expect((await sessionRoute.POST(req("/api/auth/session", "POST", { idToken: "jeton", reauth: true }))).status).toBe(401);
    expect(admin.createSessionCookie).not.toHaveBeenCalled();
  });

  it("même compte : réémet le cookie (connexion récente)", async () => {
    auth.getCurrentUser.mockResolvedValue({ uid: "titulaire", authTime: now() - 3600 });
    admin.verifyIdToken.mockResolvedValue({ uid: "titulaire", auth_time: now(), firebase: { sign_in_provider: "google.com" } });
    const res = await sessionRoute.POST(req("/api/auth/session", "POST", { idToken: "jeton", reauth: true }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/sextant_session=cookie-neuf/);
  });

  it("connexion ordinaire (sans reauth) : aucun contrôle de compte, comme avant", async () => {
    admin.verifyIdToken.mockResolvedValue({ uid: "nouveau", auth_time: now(), firebase: { sign_in_provider: "google.com" } });
    const res = await sessionRoute.POST(req("/api/auth/session", "POST", { idToken: "jeton" }));
    expect(res.status).toBe(200);
    expect(auth.getCurrentUser).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/session : fournisseur et taille du corps (SEC-14, SEC-17)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    admin.createSessionCookie.mockResolvedValue("cookie-neuf");
    admin.getUser.mockResolvedValue({ metadata: {} });
  });

  it.each(["anonymous", "password", "phone", undefined])("refuse une connexion hors Google (%s) : 403, aucun cookie", async (provider) => {
    admin.verifyIdToken.mockResolvedValue({ uid: "autre", auth_time: now(), firebase: provider ? { sign_in_provider: provider } : undefined });
    const res = await sessionRoute.POST(req("/api/auth/session", "POST", { idToken: "jeton" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Connexion Google requise." });
    expect(admin.createSessionCookie).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("clés publiques de Google injoignables (auth/argument-error au message réseau) : 503 et non « Jeton invalide »", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    admin.verifyIdToken.mockRejectedValueOnce(Object.assign(new Error("network timeout"), { code: "auth/argument-error" }));
    const res = await sessionRoute.POST(req("/api/auth/session", "POST", { idToken: "jeton" }));
    expect(res.status).toBe(503);
    expect(res.headers.get("set-cookie")).toBeNull();
    // Jeton réellement mal formé : refus (401).
    admin.verifyIdToken.mockRejectedValueOnce(Object.assign(new Error("Firebase ID token has invalid signature. See …"), { code: "auth/argument-error" }));
    expect((await sessionRoute.POST(req("/api/auth/session", "POST", { idToken: "jeton" }))).status).toBe(401);
  });

  it("refuse un corps annoncé au-delà de 8 Ko avant de vérifier le jeton", async () => {
    const res = await sessionRoute.POST(req("/api/auth/session", "POST", { idToken: "jeton" }, { "content-length": "9000" }));
    expect(res.status).toBe(413);
    expect(admin.verifyIdToken).not.toHaveBeenCalled();
  });
});
