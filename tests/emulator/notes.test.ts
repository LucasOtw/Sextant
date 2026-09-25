import { describe, expect, it, vi } from "vitest";
import { adminDb } from "@/lib/firebase/admin";
import { listAllNotes, NotesLimitError, setNote } from "@/lib/notes";
import { newUid, snap } from "./helpers";

// Plafond réduit à 2 pour le test : le comportement est le même qu'à 2 000, sans écrire 2 000 documents.
vi.mock("@/lib/notes-shared", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/notes-shared")>()), MAX_NOTES: 2 }));

describe("notes : plafond par compte (SEC-19, transactions sur émulateur)", () => {
  it("refuse une nouvelle note au plafond, mais laisse modifier ou effacer une note existante", async () => {
    const uid = newUid();
    await setNote(uid, snap(1), "Première");
    await setNote(uid, snap(2), "Deuxième");
    await expect(setNote(uid, snap(3), "Troisième")).rejects.toBeInstanceOf(NotesLimitError);
    const db = await adminDb();
    expect((await db.doc(`users/${uid}/notes/W3`).get()).exists).toBe(false);

    // Modifier une note existante au plafond : accepté.
    expect(await setNote(uid, snap(1), "Première, revue")).toMatchObject({ text: "Première, revue" });
    expect((await db.doc(`users/${uid}/notes/W1`).get()).get("text")).toBe("Première, revue");

    // Effacer libère une place.
    expect(await setNote(uid, snap(2), "")).toBeNull();
    await expect(setNote(uid, snap(3), "Troisième")).resolves.toMatchObject({ workId: "W3" });
  });

  it("créations concurrentes au bord du plafond : jamais plus de notes que le plafond", async () => {
    const uid = newUid();
    await setNote(uid, snap(1), "Une");
    const results = await Promise.allSettled([setNote(uid, snap(2), "Deux"), setNote(uid, snap(3), "Trois"), setNote(uid, snap(4), "Quatre")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await (await adminDb()).collection(`users/${uid}/notes`).get()).size).toBe(2);
  });
});

describe("listAllNotes (export RGPD)", () => {
  it("lit toutes les pages, sans doublon ni omission, même au-delà du plafond", async () => {
    const uid = newUid();
    const db = await adminDb();
    const { Timestamp } = await import("firebase-admin/firestore");
    // Compte au-delà du plafond (notes écrites avant son ajout) : écrites directement, hors setNote.
    const batch = db.batch();
    for (let i = 1; i <= 7; i++) {
      batch.set(db.doc(`users/${uid}/notes/W${i}`), { text: `Note ${i}`, article: snap(i), workId: `W${i}`, updatedAt: Timestamp.fromMillis(1_700_000_000_000 + i * 1000) });
    }
    await batch.commit();

    const all = await listAllNotes(uid, 3);
    expect(all.map((n) => n.workId)).toEqual(["W7", "W6", "W5", "W4", "W3", "W2", "W1"]);
    // Nombre exact multiple de la page : la dernière page vide termine la lecture.
    expect(await listAllNotes(uid, 7)).toHaveLength(7);
    expect(await listAllNotes(newUid())).toEqual([]);
  });
});
