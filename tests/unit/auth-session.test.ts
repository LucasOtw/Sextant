import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Lecture du cookie de session (SEC-08) : un cookie antérieur à la dernière révocation des jetons, ou d'un compte
 * supprimé ou désactivé, n'est plus reconnu, ni pour lire ni pour écrire. Cookie, Firebase Auth et Identity Toolkit
 * sont simulés : aucune requête ne part vers la base.
 */
const state = vi.hoisted(() => ({
  cookie: "cookie" as string | undefined,
  claims: { uid: "u1", auth_time: 0 } as Record<string, unknown>,
  getUser: vi.fn(),
  verifySessionCookie: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (state.cookie === undefined ? undefined : { value: state.cookie }) }),
}));
vi.mock("@/lib/firebase/admin", () => ({
  isAdminConfigured: () => true,
  adminAuth: async () => ({ verifySessionCookie: state.verifySessionCookie, getUser: state.getUser }),
  adminDb: async () => {
    throw new Error("base interdite");
  },
}));
vi.mock("@/lib/log", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/log")>()), logError: vi.fn() }));

const { forgetRevocationCheck, getCurrentUser, getCurrentUserStrict, readSessionWithReason, recheckSession, requireStrictUser } = await import("@/lib/auth");
const { forgetAccountState } = await import("@/lib/account-state");

const revokedAt = Date.parse("2026-09-20T10:00:00Z");
const sec = (ms: number) => Math.floor(ms / 1000);
const account = (over: Record<string, unknown> = {}) => ({ disabled: false, tokensValidAfterTime: new Date(revokedAt).toUTCString(), ...over });

describe("readSession : révocation, compte supprimé ou désactivé", () => {
  beforeEach(() => {
    // Rétablies après chaque test (unstubEnvs) : à reposer ici.
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "demo-key");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "demo-sextant");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_APP_ID", "demo-app");
    forgetAccountState();
    state.cookie = "cookie";
    state.getUser.mockReset();
    state.verifySessionCookie.mockReset();
    state.verifySessionCookie.mockImplementation(async () => state.claims);
  });

  it("reconnaît un cookie postérieur à la dernière révocation, pour lire comme pour écrire", async () => {
    state.claims = { uid: "u1", auth_time: sec(revokedAt) + 60, email: "a@b.c" };
    state.getUser.mockResolvedValue(account());
    await expect(getCurrentUser()).resolves.toMatchObject({ uid: "u1", email: "a@b.c" });
    await expect(getCurrentUserStrict()).resolves.toMatchObject({ uid: "u1" });
    // Contrôle local seulement (pas de checkRevoked) ; l'état du compte n'est demandé qu'une fois (mémorisé).
    expect(state.verifySessionCookie).toHaveBeenCalledWith("cookie");
    expect(state.getUser).toHaveBeenCalledTimes(1);
  });

  it("refuse un cookie antérieur à la révocation, y compris pour les lectures", async () => {
    state.claims = { uid: "u1", auth_time: sec(revokedAt) - 60 };
    state.getUser.mockResolvedValue(account());
    await expect(getCurrentUser()).resolves.toBeNull();
    await expect(getCurrentUserStrict()).resolves.toBeNull();
  });

  it("une nouvelle connexion après la révocation ne blanchit pas un cookie volé plus ancien (même uid)", async () => {
    state.getUser.mockResolvedValue(account());
    state.claims = { uid: "u1", auth_time: sec(revokedAt) + 5 };
    await expect(getCurrentUserStrict()).resolves.toMatchObject({ uid: "u1" });
    state.claims = { uid: "u1", auth_time: sec(revokedAt) - 3600 };
    await expect(getCurrentUserStrict()).resolves.toBeNull();
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("refuse un compte désactivé ou supprimé", async () => {
    state.claims = { uid: "u1", auth_time: sec(revokedAt) + 60 };
    state.getUser.mockResolvedValue(account({ disabled: true }));
    await expect(getCurrentUser()).resolves.toBeNull();
    forgetRevocationCheck("u1");
    state.getUser.mockRejectedValue(Object.assign(new Error("absent"), { code: "auth/user-not-found" }));
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("forgetRevocationCheck fait relire l'état du compte (révocation faite sur cette instance)", async () => {
    state.claims = { uid: "u1", auth_time: sec(revokedAt) + 60 };
    state.getUser.mockResolvedValue(account());
    await expect(getCurrentUser()).resolves.not.toBeNull();
    state.getUser.mockResolvedValue(account({ tokensValidAfterTime: new Date(revokedAt + 3_600_000).toUTCString() }));
    await expect(getCurrentUser()).resolves.not.toBeNull(); // encore mémorisé
    forgetRevocationCheck("u1");
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("Firebase Auth injoignable : lecture servie, écriture refusée", async () => {
    state.claims = { uid: "u1", auth_time: sec(revokedAt) + 60 };
    state.getUser.mockRejectedValue(new Error("réseau"));
    await expect(getCurrentUser()).resolves.toMatchObject({ uid: "u1" });
    await expect(getCurrentUserStrict()).resolves.toBeNull();
  });

  it("sans cookie ou avec un cookie invalide : déconnecté, sans appel à Identity Toolkit", async () => {
    state.cookie = undefined;
    await expect(getCurrentUser()).resolves.toBeNull();
    state.cookie = "cookie";
    state.verifySessionCookie.mockRejectedValue(Object.assign(new Error("expiré"), { code: "auth/session-cookie-expired" }));
    await expect(getCurrentUser()).resolves.toBeNull();
    expect(state.getUser).not.toHaveBeenCalled();
  });

  it("readSessionWithReason distingue un refus attendu d'une panne de la vérification", async () => {
    state.cookie = undefined;
    await expect(readSessionWithReason()).resolves.toEqual({ user: null, failure: null });
    state.cookie = "cookie";
    state.verifySessionCookie.mockRejectedValue(Object.assign(new Error("révoqué"), { code: "auth/session-cookie-revoked" }));
    await expect(readSessionWithReason()).resolves.toEqual({ user: null, failure: "rejected" });
    // Certificats injoignables, SDK en panne : pas un refus, l'indice de connexion ne doit pas être marqué.
    state.verifySessionCookie.mockRejectedValue(new Error("fetch failed"));
    await expect(readSessionWithReason()).resolves.toEqual({ user: null, failure: "unavailable" });
    state.verifySessionCookie.mockImplementation(async () => ({ uid: "u1", auth_time: sec(revokedAt) - 60 }));
    state.getUser.mockResolvedValue(account());
    await expect(readSessionWithReason()).resolves.toEqual({ user: null, failure: "rejected" });
    state.verifySessionCookie.mockImplementation(async () => ({ uid: "u1", auth_time: sec(revokedAt) + 60 }));
    await expect(readSessionWithReason()).resolves.toMatchObject({ user: { uid: "u1" }, failure: null });
  });

  it("clés publiques de Google injoignables : `auth/argument-error` au message réseau = panne, pas un refus", async () => {
    // firebase-admin 13 range KEY_FETCH_ERROR sous le code par défaut `auth/argument-error`, avec le message brut.
    state.verifySessionCookie.mockRejectedValue(Object.assign(new Error("network timeout"), { code: "auth/argument-error" }));
    await expect(readSessionWithReason()).resolves.toEqual({ user: null, failure: "unavailable" });
    // Cookie mal formé ou mal signé : message du vérificateur, refus.
    state.verifySessionCookie.mockRejectedValue(Object.assign(new Error("Firebase session cookie has invalid signature. See …"), { code: "auth/argument-error" }));
    await expect(readSessionWithReason()).resolves.toEqual({ user: null, failure: "rejected" });
  });

  it("requireStrictUser : 503 quand la vérification est en panne, 401 pour un refus ou sans cookie", async () => {
    state.claims = { uid: "u1", auth_time: sec(revokedAt) + 60 };
    state.getUser.mockRejectedValue(new Error("réseau"));
    const down = await requireStrictUser();
    expect(down.ok).toBe(false);
    expect(down.refused?.status).toBe(503);
    expect(down.refused?.headers.get("retry-after")).toBe("5");
    expect(((await down.refused!.json()) as { error: string }).error).not.toBe("Non connecté.");

    state.getUser.mockResolvedValue(account());
    state.claims = { uid: "u1", auth_time: sec(revokedAt) - 60 };
    expect((await requireStrictUser()).refused?.status).toBe(401);
    state.cookie = undefined;
    const none = await requireStrictUser("Connectez-vous pour voter.");
    expect(none.refused?.status).toBe(401);
    expect(await none.refused!.json()).toEqual({ error: "Connectez-vous pour voter." });
  });

  it("requireStrictUser : la raison vient de la même lecture (une panne résorbée juste après reste un 503, pas « Non connecté »)", async () => {
    state.claims = { uid: "u1", auth_time: sec(revokedAt) + 60 };
    state.getUser.mockRejectedValueOnce(new Error("réseau")).mockResolvedValue(account());
    const res = await requireStrictUser();
    expect(res.refused?.status).toBe(503);
    expect(state.getUser).toHaveBeenCalledTimes(1);
  });

  it("recheckSession relit l'état du compte sans le cache de l'instance (révocation faite ailleurs)", async () => {
    state.claims = { uid: "u1", auth_time: sec(revokedAt) - 60 };
    // Instance au cache périmé : l'état d'avant la révocation est mémorisé.
    state.getUser.mockResolvedValueOnce(account({ tokensValidAfterTime: new Date(revokedAt - 3_600_000).toUTCString() }));
    await expect(getCurrentUserStrict()).resolves.toMatchObject({ uid: "u1" });
    state.getUser.mockResolvedValue(account());
    await expect(recheckSession({ uid: "u1", authTime: sec(revokedAt) - 60 })).resolves.toBe(false);
    await expect(recheckSession({ uid: "u1", authTime: sec(revokedAt) + 60 })).resolves.toBe(true);
    state.getUser.mockRejectedValue(new Error("réseau"));
    await expect(recheckSession({ uid: "u1", authTime: sec(revokedAt) + 60 })).rejects.toThrow();
  });
});
