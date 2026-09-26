import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { createFeedback, listFeedback } from "@/lib/feedback";
import { newUid } from "./helpers";

/**
 * Liste de /retours (NEW-11) : les plus votés ET les plus récents, pour qu'un sujet ancien et très soutenu ne sorte
 * pas du tableau quand la collection grossit. La base de l'émulateur est partagée entre les fichiers de test, lancés
 * en parallèle : les sujets de ce test sont rendus sans ambiguïté les plus votés ou les plus récents.
 */
describe("listFeedback (émulateur)", () => {
  it("garde le sujet le plus voté même s'il est plus ancien que tous les récents", async () => {
    const db = await adminDb();
    const tag = newUid();
    // Très ancien, et plus voté que tout ce que les autres tests peuvent créer (nombre croissant d'une exécution à l'autre).
    const old = db.collection("feedback").doc();
    await old.set({ kind: "idea", title: `Ancien ${tag}`, description: "", votes: 1e12 + Date.now(), status: "planned", authorUid: null, createdAt: Timestamp.fromDate(new Date("2001-01-01")) });
    // Plus récents que tout autre sujet de la base : dates dans le futur, croissantes.
    const future = Date.now() + 100 * 365 * 86_400_000;
    const recent = await Promise.all(
      [1, 2].map(async (k) => {
        const ref = db.collection("feedback").doc();
        await ref.set({ kind: "bug", title: `Récent ${k} ${tag}`, description: "", votes: 0, status: "open", authorUid: null, createdAt: Timestamp.fromMillis(future + k) });
        return ref.id;
      }),
    );

    const { items } = await listFeedback({ top: 1, recent: 2 });
    expect(items.map((i) => i.id).sort()).toEqual([old.id, ...recent].sort());
    expect(items.find((i) => i.id === old.id)?.status).toBe("planned");
  });

  it("totaux comptés dans la base, par type, au-delà des sujets chargés", async () => {
    const before = (await listFeedback({ top: 1, recent: 1 })).totals;
    const uid = newUid();
    await createFeedback(uid, { kind: "bug", title: "Bug compté 1", description: "" });
    await createFeedback(uid, { kind: "bug", title: "Bug compté 2", description: "" });
    await createFeedback(uid, { kind: "idea", title: "Idée comptée", description: "" });
    const { items, totals } = await listFeedback({ top: 1, recent: 1 });
    expect(items.length).toBeLessThanOrEqual(2);
    expect(totals.all).toBe(totals.bug + totals.idea);
    // Au moins nos trois sujets de plus (d'autres fichiers de test peuvent en créer en même temps).
    expect(totals.bug - before.bug).toBeGreaterThanOrEqual(2);
    expect(totals.idea - before.idea).toBeGreaterThanOrEqual(1);
    expect(totals.all).toBeGreaterThan(items.length);
  });
});
