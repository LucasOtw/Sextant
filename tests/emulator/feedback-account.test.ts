import { describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { createFeedback, FeedbackNotFoundError, toggleVote, userFeedbackVotes } from "@/lib/feedback";
import { addToCollection, createCollection } from "@/lib/collections";
import { createShare } from "@/lib/shares";
import { createKey } from "@/lib/api-keys";
import { exists, newUid, snap } from "./helpers";

// Session simulée : la route de suppression lit l'utilisateur via le cookie (Firebase Auth), hors du périmètre ici.
const session = vi.hoisted(() => ({ uid: "" }));
// Connexion Google « récente » (authTime = maintenant) : la suppression exige une connexion de moins de 10 minutes (SEC-09).
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  getCurrentUserStrict: async () => (session.uid ? { uid: session.uid, email: null, name: null, picture: null, authTime: Math.floor(Date.now() / 1000) } : null),
  forgetRevocationCheck: () => {},
}));

describe("retours et votes (transactions sur émulateur)", () => {
  it("l'auteur vote d'office ; un second appel retire le vote, un troisième le remet", async () => {
    const uid = newUid();
    const item = await createFeedback(uid, { kind: "idea", title: "Export RIS", description: "Pour Zotero." });
    const db = await adminDb();
    const stored = await db.doc(`feedback/${item.id}`).get();
    expect(stored.get("createdAt")).toBeInstanceOf(Timestamp);
    expect(stored.get("votes")).toBe(1);
    expect(await userFeedbackVotes(uid)).toEqual([item.id]);

    expect(await toggleVote(uid, item.id)).toEqual({ votes: 0, voted: false });
    expect(await userFeedbackVotes(uid)).toEqual([]);
    expect(await toggleVote(uid, item.id)).toEqual({ votes: 1, voted: true });

    const other = newUid();
    expect(await toggleVote(other, item.id)).toEqual({ votes: 2, voted: true });
    expect((await db.doc(`feedback/${item.id}`).get()).get("votes")).toBe(2);
  });

  it("votes concurrents du même utilisateur : le compteur reste cohérent avec le vote enregistré", async () => {
    const uid = newUid();
    const item = await createFeedback(newUid(), { kind: "bug", title: "Bouton muet", description: "" });
    await Promise.all([toggleVote(uid, item.id), toggleVote(uid, item.id), toggleVote(uid, item.id)]);
    const voted = (await userFeedbackVotes(uid)).includes(item.id);
    const votes = (await (await adminDb()).doc(`feedback/${item.id}`).get()).get("votes");
    expect(votes).toBe(voted ? 2 : 1);
  });

  it("vote sur un sujet inexistant : FeedbackNotFoundError, rien n'est écrit", async () => {
    const uid = newUid();
    await expect(toggleVote(uid, "inexistant")).rejects.toBeInstanceOf(FeedbackNotFoundError);
    expect(await exists(`users/${uid}/feedbackVotes/inexistant`)).toBe(false);
  });
});

describe("suppression du compte (DELETE /api/auth/account, émulateurs Firestore et Auth)", () => {
  it("efface en cascade profil, favoris, listes, liens, clés et votes ; détache les sujets ; supprime le compte Auth", async () => {
    const { DELETE } = await import("@/app/api/auth/account/route");
    const uid = newUid();
    const auth = await adminAuth();
    await auth.createUser({ uid, email: `${uid}@exemple.org` });

    const list = await createCollection(uid, "Lecture");
    await addToCollection(uid, list.id, snap(1));
    const token = await createShare(uid, list.id);
    const { info } = await createKey(uid, "Claude");
    const item = await createFeedback(uid, { kind: "idea", title: "Garder ce sujet", description: "" });
    // Données d'un autre utilisateur, qui doivent survivre.
    const bystander = newUid();
    const bystanderList = await createCollection(bystander, "Voisin");
    const bystanderToken = await createShare(bystander, bystanderList.id);
    await toggleVote(bystander, item.id);

    session.uid = uid;
    try {
      const res = await DELETE(new Request("https://sextant.test/api/auth/account", { method: "DELETE", headers: { "sec-fetch-site": "same-origin" } }));
      expect(res.status).toBe(200);
      expect(res.headers.get("set-cookie")).toMatch(/sextant_session=;/);
    } finally {
      session.uid = "";
    }

    const db = await adminDb();
    expect(await exists(`users/${uid}`)).toBe(false);
    expect((await db.collection(`users/${uid}/favorites`).get()).empty).toBe(true);
    expect((await db.collection(`users/${uid}/collections`).get()).empty).toBe(true);
    expect((await db.collection(`users/${uid}/feedbackVotes`).get()).empty).toBe(true);
    expect(await exists(`shares/${token}`)).toBe(false);
    expect(await exists(`apiKeys/${info.id}`)).toBe(false);
    await expect(auth.getUser(uid)).rejects.toMatchObject({ code: "auth/user-not-found" });

    const kept = await db.doc(`feedback/${item.id}`).get();
    expect(kept.exists).toBe(true);
    expect(kept.get("authorUid")).toBeNull();
    expect(kept.get("votes")).toBe(2);
    expect(await exists(`shares/${bystanderToken}`)).toBe(true);
    expect(await exists(`users/${bystander}/collections/${bystanderList.id}`)).toBe(true);
  });

  it("sans session : 401, rien n'est supprimé", async () => {
    const { DELETE } = await import("@/app/api/auth/account/route");
    const uid = newUid();
    await createCollection(uid, "Intacte");
    const res = await DELETE(new Request("https://sextant.test/api/auth/account", { method: "DELETE" }));
    expect(res.status).toBe(401);
    expect((await (await adminDb()).collection(`users/${uid}/collections`).get()).size).toBe(1);
  });
});
