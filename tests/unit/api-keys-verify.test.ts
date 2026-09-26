import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * verifyKey (SEC-11) : une clé MCP suit l'état du compte Firebase, comme une session web. Firestore et Firebase Auth
 * sont simulés (jamais la vraie base).
 */
const KEY = `sxt_${"A".repeat(43)}`;
const state = vi.hoisted(() => ({
  doc: null as null | Record<string, unknown>,
  getUser: vi.fn(),
  update: vi.fn(async () => undefined),
  writes: [] as unknown[][],
  commit: vi.fn(async () => undefined),
}));

vi.mock("@/lib/firebase/admin", () => ({
  isAdminConfigured: () => true,
  adminDb: async () => ({
    doc: (path: string) => ({
      path,
      get: async () => ({
        exists: state.doc !== null,
        get: (field: string) => state.doc?.[field],
        ref: { path, update: state.update },
      }),
    }),
    batch: () => ({
      update: (ref: { path: string }, data: unknown) => state.writes.push(["update", ref.path, data]),
      set: (ref: { path: string }, data: unknown, opts: unknown) => state.writes.push(["set", ref.path, data, opts]),
      commit: state.commit,
    }),
  }),
  adminAuth: async () => ({ getUser: state.getUser }),
}));
vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: () => "maintenant" } }));

const { forgetAccountState, hashKey, verifyKey } = await import("@/lib/api-keys");

const ts = (ms: number) => ({ toMillis: () => ms });
const created = Date.parse("2026-09-01T10:00:00Z");

describe("verifyKey : état du compte Firebase", () => {
  beforeEach(() => {
    forgetAccountState();
    state.getUser.mockReset();
    state.writes = [];
    state.doc = { uid: "u1", createdAt: ts(created), lastUsedAt: ts(Date.now()) };
  });

  it("accepte une clé d'un compte actif, jamais révoqué depuis sa création", async () => {
    state.getUser.mockResolvedValue({ disabled: false, tokensValidAfterTime: "Mon, 01 Jun 2026 08:00:00 GMT" });
    await expect(verifyKey(KEY)).resolves.toEqual({ uid: "u1", keyId: hashKey(KEY) });
  });

  it("refuse une clé inconnue", async () => {
    state.doc = null;
    await expect(verifyKey(KEY)).resolves.toBeNull();
    expect(state.getUser).not.toHaveBeenCalled();
  });

  it("refuse une clé d'un compte désactivé", async () => {
    state.getUser.mockResolvedValue({ disabled: true });
    await expect(verifyKey(KEY)).resolves.toBeNull();
  });

  it("refuse une clé d'un compte supprimé depuis la console (clé orpheline)", async () => {
    state.getUser.mockRejectedValue(Object.assign(new Error("absent"), { code: "auth/user-not-found" }));
    await expect(verifyKey(KEY)).resolves.toBeNull();
  });

  it("refuse une clé créée avant la dernière révocation des jetons, accepte celle créée après", async () => {
    state.getUser.mockResolvedValue({ disabled: false, tokensValidAfterTime: new Date(created + 60_000).toUTCString() });
    await expect(verifyKey(KEY)).resolves.toBeNull();
    state.doc = { uid: "u1", createdAt: ts(created + 120_000), lastUsedAt: ts(Date.now()) };
    await expect(verifyKey(KEY)).resolves.not.toBeNull();
  });

  it("clé sans date de création : pas refusée pour autant (compatibilité)", async () => {
    state.doc = { uid: "u1", lastUsedAt: ts(Date.now()) };
    state.getUser.mockResolvedValue({ disabled: false, tokensValidAfterTime: new Date().toUTCString() });
    await expect(verifyKey(KEY)).resolves.not.toBeNull();
  });

  it("échec fermé si Firebase Auth ne répond pas : l'erreur remonte (503 côté route, pas « clé invalide »), sans être mémorisée", async () => {
    state.getUser.mockRejectedValueOnce(Object.assign(new Error("panne"), { code: "app/network-error" }));
    await expect(verifyKey(KEY)).rejects.toThrow("panne");
    state.getUser.mockResolvedValue({ disabled: false });
    await expect(verifyKey(KEY)).resolves.not.toBeNull();
  });

  it("clé rattachée à une session antérieure à la révocation : refusée même si elle a été écrite après (cache périmé ailleurs)", async () => {
    const revokedAt = created + 60_000;
    state.getUser.mockResolvedValue({ disabled: false, tokensValidAfterTime: new Date(revokedAt).toUTCString() });
    // Écrite 2 minutes après la révocation, par une session ouverte 1 minute avant.
    state.doc = { uid: "u1", createdAt: ts(revokedAt + 120_000), lastUsedAt: ts(Date.now()), sessionAuthTime: Math.floor((revokedAt - 60_000) / 1000) };
    await expect(verifyKey(KEY)).resolves.toBeNull();
    // Session ouverte après la révocation : acceptée.
    state.doc = { uid: "u1", createdAt: ts(revokedAt + 120_000), lastUsedAt: ts(Date.now()), sessionAuthTime: Math.floor((revokedAt + 60_000) / 1000) };
    await expect(verifyKey(KEY)).resolves.not.toBeNull();
  });

  it("l'état du compte est mémorisé 5 minutes : un seul appel à Firebase Auth pour une rafale", async () => {
    state.getUser.mockResolvedValue({ disabled: false });
    for (let i = 0; i < 5; i++) await verifyKey(KEY);
    expect(state.getUser).toHaveBeenCalledTimes(1);
  });

  it("usage noté au plus une fois par heure, sur la clé et dans le profil (trace gardée après la purge de la clé, NEW-14)", async () => {
    state.getUser.mockResolvedValue({ disabled: false });
    await verifyKey(KEY);
    expect(state.writes).toEqual([]);
    state.doc = { uid: "u1", createdAt: ts(created), lastUsedAt: ts(Date.now() - 2 * 3600 * 1000) };
    await verifyKey(KEY);
    expect(state.writes).toEqual([
      ["update", `apiKeys/${hashKey(KEY)}`, { lastUsedAt: "maintenant" }],
      ["set", "users/u1", { lastKeyUsedAt: "maintenant" }, { merge: true }],
    ]);
    expect(state.commit).toHaveBeenCalledOnce();
  });
});
