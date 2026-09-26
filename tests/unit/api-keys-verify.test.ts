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
}));

vi.mock("@/lib/firebase/admin", () => ({
  isAdminConfigured: () => true,
  adminDb: async () => ({
    doc: () => ({
      get: async () => ({
        exists: state.doc !== null,
        get: (field: string) => state.doc?.[field],
        ref: { update: state.update },
      }),
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

  it("échec fermé si Firebase Auth ne répond pas, sans mémoriser l'échec", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.getUser.mockRejectedValueOnce(Object.assign(new Error("panne"), { code: "app/network-error" }));
    await expect(verifyKey(KEY)).resolves.toBeNull();
    state.getUser.mockResolvedValue({ disabled: false });
    await expect(verifyKey(KEY)).resolves.not.toBeNull();
  });

  it("l'état du compte est mémorisé 5 minutes : un seul appel à Firebase Auth pour une rafale", async () => {
    state.getUser.mockResolvedValue({ disabled: false });
    for (let i = 0; i < 5; i++) await verifyKey(KEY);
    expect(state.getUser).toHaveBeenCalledTimes(1);
  });
});
