import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Garde-fou de développement (NEW-4) : `isAdminConfigured()` du vrai module, importé par son chemin relatif (l'alias
 * de vitest.config.mts ne remplace que `@/lib/firebase/admin`). Seule cette fonction est appelée : elle lit les
 * variables d'environnement, n'initialise rien et ne contacte aucun service. Le compte de service est factice.
 */
const FAKE_SA = JSON.stringify({ project_id: "demo-garde", client_email: "test@demo-garde.iam.gserviceaccount.com", private_key: "factice" });

async function freshModule() {
  vi.resetModules();
  return import("../../src/lib/firebase/admin");
}

describe("isAdminConfigured : base de production refusée en développement", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT", FAKE_SA);
    vi.stubEnv("FIRESTORE_EMULATOR_HOST", "");
    vi.stubEnv("ALLOW_PROD_DB", "");
  });

  it("développement sans accord explicite : comptes désactivés, avec un avertissement", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { isAdminConfigured } = await freshModule();
    expect(isAdminConfigured()).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("ALLOW_PROD_DB=1"));
  });

  it("développement avec ALLOW_PROD_DB=1 : comptes actifs", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_PROD_DB", "1");
    const { isAdminConfigured } = await freshModule();
    expect(isAdminConfigured()).toBe(true);
  });

  it("développement sur émulateur (projet demo-…) : comptes actifs, sans clé de production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT", "");
    vi.stubEnv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080");
    vi.stubEnv("GCLOUD_PROJECT", "demo-sextant");
    const { isAdminConfigured } = await freshModule();
    expect(isAdminConfigured()).toBe(true);
  });

  it("production et tests : inchangé", async () => {
    for (const env of ["production", "test"]) {
      vi.stubEnv("NODE_ENV", env);
      const { isAdminConfigured } = await freshModule();
      expect(isAdminConfigured()).toBe(true);
    }
  });
});
