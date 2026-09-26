import { describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { purgeInactive } from "@/lib/account";
import { createCollection } from "@/lib/collections";
import { createFeedback } from "@/lib/feedback";
import { createShare } from "@/lib/shares";
import { exists, newUid } from "./helpers";

// Hors d'une requête Next, revalidateTag lève : l'invalidation du cache de /retours est simulée.
vi.mock("next/cache", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/cache")>()), revalidateTag: vi.fn() }));

/**
 * Purge des données dormantes (NEW-14). Les durées sont passées en paramètre (lib/retention.ts les laisse à null
 * tant que l'éditeur n'a pas décidé). Seules des données datées de 2000 sont visées : les autres fichiers de test,
 * qui écrivent des données du jour dans le même émulateur, ne sont jamais touchés.
 */
const OLD = new Date("2000-01-02T00:00:00Z");
const NOW = Date.now();

async function oldUser(uid: string): Promise<void> {
  const r = await (await adminAuth()).importUsers([{ uid, metadata: { creationTime: OLD.toUTCString(), lastSignInTime: OLD.toUTCString() } }]);
  expect(r.successCount).toBe(1);
}

async function key(uid: string, createdAt: Date, lastUsedAt: Date | null): Promise<string> {
  const id = `test-key-${newUid()}`;
  await (await adminDb()).doc(`apiKeys/${id}`).set({
    uid,
    name: "Claude",
    prefix: "sxt_abcdef",
    createdAt: Timestamp.fromDate(createdAt),
    lastUsedAt: lastUsedAt ? Timestamp.fromDate(lastUsedAt) : null,
  });
  return id;
}

describe("purgeInactive (émulateurs Firestore et Auth)", () => {
  it("sans durée décidée : rien n'est lu ni supprimé", async () => {
    const uid = newUid();
    await oldUser(uid);
    const k = await key(uid, OLD, null);
    expect(await purgeInactive({ now: NOW, accountMonths: null, keyMonths: null, dryRun: false })).toEqual({ dryRun: false, keys: 0, accounts: 0, truncated: false, failed: 0 });
    expect(await exists(`apiKeys/${k}`)).toBe(true);
    await expect((await adminAuth()).getUser(uid)).resolves.toMatchObject({ uid });
  });

  it("à blanc : compte les clés et les comptes dormants sans rien supprimer", async () => {
    const uid = newUid();
    await oldUser(uid);
    const k = await key(newUid(), OLD, OLD);
    const report = await purgeInactive({ now: NOW, accountMonths: 36, keyMonths: 12, dryRun: true });
    expect(report.dryRun).toBe(true);
    expect(report.keys).toBeGreaterThanOrEqual(1);
    expect(report.accounts).toBeGreaterThanOrEqual(1);
    expect(await exists(`apiKeys/${k}`)).toBe(true);
    await expect((await adminAuth()).getUser(uid)).resolves.toMatchObject({ uid });
  });

  it("supprime les clés inutilisées et les comptes inactifs avec leurs données ; garde le reste", async () => {
    const auth = await adminAuth();
    const db = await adminDb();
    const recent = new Date(NOW - 24 * 3600 * 1000);

    // Compte inactif depuis 2000, avec une liste partagée et un sujet publié.
    const dormant = newUid();
    await oldUser(dormant);
    const list = await createCollection(dormant, "Ancienne liste");
    const token = await createShare(dormant, list.id);
    const item = await createFeedback(dormant, { kind: "idea", title: "Sujet ancien", description: "" });
    const dormantKey = await key(dormant, OLD, OLD);

    // Jamais connecté depuis 2000, mais sa clé a servi hier : utilisateur « assistant IA seulement », gardé.
    const mcpOnly = newUid();
    await oldUser(mcpOnly);
    const mcpKey = await key(mcpOnly, OLD, recent);

    // Compte récent, avec une clé créée il y a longtemps et jamais utilisée (supprimée) et une clé neuve (gardée).
    const active = newUid();
    await auth.createUser({ uid: active });
    const staleKey = await key(active, OLD, null);
    const freshKey = await key(active, recent, null);

    const report = await purgeInactive({ now: NOW, accountMonths: 36, keyMonths: 12, dryRun: false });
    expect(report.failed).toBe(0);

    await expect(auth.getUser(dormant)).rejects.toMatchObject({ code: "auth/user-not-found" });
    expect(await exists(`users/${dormant}/collections/${list.id}`)).toBe(false);
    expect(await exists(`shares/${token}`)).toBe(false);
    expect(await exists(`apiKeys/${dormantKey}`)).toBe(false);
    // Le sujet reste en ligne, détaché du compte ; le vote d'office de l'auteur est retiré.
    const kept = await db.doc(`feedback/${item.id}`).get();
    expect(kept.get("authorUid")).toBeNull();
    expect(kept.get("votes")).toBe(0);

    await expect(auth.getUser(mcpOnly)).resolves.toMatchObject({ uid: mcpOnly });
    expect(await exists(`apiKeys/${mcpKey}`)).toBe(true);

    await expect(auth.getUser(active)).resolves.toMatchObject({ uid: active });
    expect(await exists(`apiKeys/${staleKey}`)).toBe(false);
    expect(await exists(`apiKeys/${freshKey}`)).toBe(true);
  });

  it("borne le nombre de comptes supprimés par passage", async () => {
    const auth = await adminAuth();
    const a = newUid();
    const b = newUid();
    await oldUser(a);
    await oldUser(b);
    const report = await purgeInactive({ now: NOW, accountMonths: 36, keyMonths: null, dryRun: false, maxAccounts: 1 });
    expect(report.accounts).toBe(1);
    expect(report.truncated).toBe(true);
    const left = await Promise.all([a, b].map((uid) => auth.getUser(uid).then(() => 1, () => 0)));
    expect(left.reduce<number>((n, x) => n + x, 0)).toBe(1);
    // Passage suivant : le reste.
    await purgeInactive({ now: NOW, accountMonths: 36, keyMonths: null, dryRun: false });
    await expect(auth.getUser(a)).rejects.toMatchObject({ code: "auth/user-not-found" });
    await expect(auth.getUser(b)).rejects.toMatchObject({ code: "auth/user-not-found" });
  });
});
