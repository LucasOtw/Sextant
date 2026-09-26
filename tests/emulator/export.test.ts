import { describe, expect, it } from "vitest";
import { createKey, listKeysForExport } from "@/lib/api-keys";
import { createCollection } from "@/lib/collections";
import { createFeedback, listFeedbackByAuthor, listFeedbackVotesForExport, toggleVote } from "@/lib/feedback";
import { createShare, listSharesForExport } from "@/lib/shares";
import { newUid } from "./helpers";

/** Lectures de l'export RGPD (NEW-2) : les données du compte rangées hors de `users/{uid}` sont bien retrouvées. */
describe("export des données du compte (émulateur Firestore)", () => {
  it("sujets publiés et votes datés de l'utilisateur, et seulement les siens", async () => {
    const uid = newUid();
    const mine = await createFeedback(uid, { kind: "bug", title: "Bouton muet", description: "Sur mobile." });
    const other = await createFeedback(newUid(), { kind: "idea", title: "Export RIS", description: "" });
    await toggleVote(uid, other.id);

    const published = await listFeedbackByAuthor(uid);
    expect(published.map((i) => i.id)).toEqual([mine.id]);
    expect(published[0]).toMatchObject({ kind: "bug", title: "Bouton muet", votes: 1, status: "open" });
    expect(published[0].createdAt).toMatch(/^\d{4}-/);

    const votes = await listFeedbackVotesForExport(uid);
    expect(votes.map((v) => v.id).sort()).toEqual([mine.id, other.id].sort());
    expect(votes.every((v) => typeof v.createdAt === "string")).toBe(true);
  });

  it("clés sans empreinte, avec la date de la session qui les a créées", async () => {
    const uid = newUid();
    const { info } = await createKey(uid, "Claude", 1_758_000_000);
    const keys = await listKeysForExport(uid);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({ name: "Claude", prefix: info.prefix, lastUsedAt: null, createdBySessionAt: new Date(1_758_000_000_000).toISOString() });
    expect(JSON.stringify(keys)).not.toContain(info.id);
  });

  it("liens de partage actifs de l'utilisateur", async () => {
    const uid = newUid();
    const list = await createCollection(uid, "Partagée");
    const token = await createShare(uid, list.id);
    // Lien d'un autre utilisateur : absent de l'export.
    const other = newUid();
    await createShare(other, (await createCollection(other, "Autre")).id);
    const shares = await listSharesForExport(uid);
    expect(shares).toEqual([{ token, collectionId: list.id, createdAt: expect.stringMatching(/^\d{4}-/) }]);
  });
});
