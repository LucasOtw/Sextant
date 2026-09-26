import { beforeEach, describe, expect, it, vi } from "vitest";
import { isKeyUnused, lastActivity, monthsBefore, retentionLabel, validMonths } from "@/lib/retention";

describe("durées de conservation (lib/retention.ts, NEW-14)", () => {
  it("n'accepte qu'un nombre entier de mois, au moins 1", () => {
    expect(validMonths(12)).toBe(12);
    expect(validMonths(null)).toBeNull();
    expect(validMonths(0)).toBeNull();
    expect(validMonths(-3)).toBeNull();
    expect(validMonths(1.5)).toBeNull();
    expect(validMonths(Number.NaN)).toBeNull();
  });

  it("recule de N mois civils", () => {
    const now = Date.UTC(2026, 8, 26, 12);
    expect(new Date(monthsBefore(now, 12)).toISOString()).toBe("2025-09-26T12:00:00.000Z");
    expect(new Date(monthsBefore(now, 36)).toISOString()).toBe("2023-09-26T12:00:00.000Z");
  });

  it("dernière activité : la plus récente des dates connues, 0 sans aucune", () => {
    expect(lastActivity(10, null, 30, undefined, 20)).toBe(30);
    expect(lastActivity(null, undefined, Number.NaN)).toBe(0);
  });

  it("clé inutilisée : dernier usage, ou création si jamais servie ; gardée sans date connue", () => {
    const cutoff = 1_000;
    expect(isKeyUnused({ createdAt: 500, lastUsedAt: null }, cutoff)).toBe(true);
    expect(isKeyUnused({ createdAt: 500, lastUsedAt: 2_000 }, cutoff)).toBe(false);
    expect(isKeyUnused({ createdAt: 2_000, lastUsedAt: null }, cutoff)).toBe(false);
    expect(isKeyUnused({ createdAt: null, lastUsedAt: null }, cutoff)).toBe(false);
  });

  it("libellé pour la politique", () => {
    expect(retentionLabel(12)).toBe("1 an");
    expect(retentionLabel(36)).toBe("3 ans");
    expect(retentionLabel(18)).toBe("18 mois");
  });
});

// Route de la tâche planifiée : secret, durées et mode à blanc. La purge elle-même est testée sur émulateur.
const retention = vi.hoisted(() => ({ RETENTION: { inactiveAccountMonths: null as number | null, unusedKeyMonths: null as number | null, messageMonths: null as number | null } }));
const account = vi.hoisted(() => ({ purgeInactive: vi.fn() }));
const feedback = vi.hoisted(() => ({ refreshFeedbackList: vi.fn() }));
vi.mock("@/lib/retention", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/retention")>()), RETENTION: retention.RETENTION }));
vi.mock("@/lib/account", () => account);
vi.mock("@/lib/feedback", () => feedback);
vi.mock("@/lib/firebase/admin", () => ({ isAdminConfigured: () => true }));

const { GET } = await import("@/app/api/cron/retention/route");

function call(query = "", auth?: string) {
  return GET(new Request(`https://sextant.test/api/cron/retention${query}`, { headers: auth ? { authorization: auth } : {} }));
}

describe("GET /api/cron/retention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    retention.RETENTION.inactiveAccountMonths = null;
    retention.RETENTION.unusedKeyMonths = null;
    account.purgeInactive.mockResolvedValue({ dryRun: false, keys: 2, accounts: 1, truncated: false, failed: 0 });
  });

  it("sans CRON_SECRET : 503, rien n'est lancé", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("", "Bearer ")).status).toBe(503);
    expect(account.purgeInactive).not.toHaveBeenCalled();
  });

  it("secret absent ou faux : 401", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-de-test");
    expect((await call()).status).toBe(401);
    expect((await call("", "Bearer autre")).status).toBe(401);
    expect((await call("", "s3cret-de-test")).status).toBe(401);
    expect(account.purgeInactive).not.toHaveBeenCalled();
  });

  it("durées non décidées : ne fait rien", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-de-test");
    const res = await call("", "Bearer s3cret-de-test");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: false });
    expect(account.purgeInactive).not.toHaveBeenCalled();
  });

  it("durées décidées : purge, puis relit la liste de /retours", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-de-test");
    retention.RETENTION.inactiveAccountMonths = 36;
    retention.RETENTION.unusedKeyMonths = 12;
    const res = await call("", "Bearer s3cret-de-test");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toMatchObject({ enabled: true, keys: 2, accounts: 1 });
    expect(account.purgeInactive).toHaveBeenCalledWith(expect.objectContaining({ accountMonths: 36, keyMonths: 12, dryRun: false }));
    expect(feedback.refreshFeedbackList).toHaveBeenCalledOnce();
  });

  it("?dryRun=1 : à blanc, sans invalidation", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-de-test");
    retention.RETENTION.unusedKeyMonths = 12;
    account.purgeInactive.mockResolvedValue({ dryRun: true, keys: 3, accounts: 0, truncated: false, failed: 0 });
    const res = await call("?dryRun=1", "Bearer s3cret-de-test");
    expect(await res.json()).toMatchObject({ enabled: true, dryRun: true, keys: 3 });
    expect(account.purgeInactive).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }));
    expect(feedback.refreshFeedbackList).not.toHaveBeenCalled();
  });

  it("?dryRun=1 avec des durées candidates : essai à blanc avant de publier les durées", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-de-test");
    account.purgeInactive.mockResolvedValue({ dryRun: true, keys: 1, accounts: 4, truncated: false, failed: 0 });
    const res = await call("?dryRun=1&accountMonths=36&keyMonths=12", "Bearer s3cret-de-test");
    expect(await res.json()).toMatchObject({ enabled: false, accountMonths: 36, keyMonths: 12, dryRun: true, accounts: 4 });
    expect(account.purgeInactive).toHaveBeenCalledWith(expect.objectContaining({ accountMonths: 36, keyMonths: 12, dryRun: true }));
    // Une seule durée candidate : l'autre reste celle publiée (ici aucune).
    await call("?dryRun=1&keyMonths=24", "Bearer s3cret-de-test");
    expect(account.purgeInactive).toHaveBeenLastCalledWith(expect.objectContaining({ accountMonths: null, keyMonths: 24, dryRun: true }));
  });

  it("dryRun autre que « 1 » (true, yes, 0, vide) ou nom mal saisi (dryrun, dry_run) : 400, aucune purge réelle avec les durées publiées", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-de-test");
    retention.RETENTION.inactiveAccountMonths = 36;
    for (const q of ["dryRun=true", "dryRun=yes", "dryRun=0", "dryRun=", "dryRun=1%20", "dryRun=true&accountMonths=60", "dryrun=1", "dry_run=1", "dryRun_=1", "dryRun=1&dry_run=1"]) {
      expect((await call(`?${q}`, "Bearer s3cret-de-test")).status, q).toBe(400);
    }
    expect(account.purgeInactive).not.toHaveBeenCalled();
  });

  it("durées candidates sans dryRun=1 : 400, jamais ignorées en silence", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-de-test");
    retention.RETENTION.inactiveAccountMonths = 36;
    for (const q of ["accountMonths=1", "keyMonths=1", "accountMonths=60&keyMonths=12"]) {
      expect((await call(`?${q}`, "Bearer s3cret-de-test")).status, q).toBe(400);
    }
    expect(account.purgeInactive).not.toHaveBeenCalled();
  });

  it("durée candidate illisible : 400, rien n'est lancé", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-de-test");
    for (const q of ["accountMonths=0", "keyMonths=-3", "keyMonths=1.5", "accountMonths=abc", "accountMonths="]) {
      expect((await call(`?dryRun=1&${q}`, "Bearer s3cret-de-test")).status, q).toBe(400);
    }
    expect(account.purgeInactive).not.toHaveBeenCalled();
  });
});
