import { describe, expect, it } from "vitest";
import type { DecodedIdToken } from "firebase-admin/auth";
import { accountCreatedAt, readProfile, recordLogin } from "@/lib/account";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { createCollection } from "@/lib/collections";
import { createShare, deleteAllShares } from "@/lib/shares";
import { exists, newUid, userDoc } from "./helpers";

/** Module de compte (QUAL-23) : profil écrit à la connexion, date d'inscription, liens de partage d'un compte. */
const token = (uid: string) => ({ uid, email: `${uid}@exemple.org`, name: "Ada", picture: null }) as unknown as DecodedIdToken;

describe("profil users/{uid} (émulateur)", () => {
  it("recordLogin : profil créé puis rafraîchi, date d'inscription de Firebase Auth jamais remplacée, autres champs gardés", async () => {
    const uid = newUid();
    const user = await (await adminAuth()).createUser({ uid, email: `${uid}@exemple.org` });
    const created = new Date(user.metadata.creationTime).getTime();

    await recordLogin(token(uid));
    const first = await userDoc(uid);
    expect(first).toMatchObject({ email: `${uid}@exemple.org`, name: "Ada", picture: null });
    expect((first?.createdAt as { toMillis(): number }).toMillis()).toBe(created);
    const firstLogin = (first?.lastLoginAt as { toMillis(): number }).toMillis();

    // Données posées ailleurs (favoris) : la connexion suivante les laisse en place (écriture fusionnée).
    await (await adminDb()).doc(`users/${uid}`).set({ favoriteIds: ["W4200000001"] }, { merge: true });
    await recordLogin(token(uid));
    const second = await userDoc(uid);
    expect(second?.favoriteIds).toEqual(["W4200000001"]);
    expect((second?.createdAt as { toMillis(): number }).toMillis()).toBe(created);
    expect((second?.lastLoginAt as { toMillis(): number }).toMillis()).toBeGreaterThanOrEqual(firstLogin);
  });

  it("accountCreatedAt : date du profil, sinon celle de Firebase Auth, sinon null", async () => {
    const uid = newUid();
    const user = await (await adminAuth()).createUser({ uid });
    // Profil absent : repli sur Firebase Auth.
    expect((await accountCreatedAt(uid, await readProfile(uid)))?.getTime()).toBe(new Date(user.metadata.creationTime).getTime());
    const { Timestamp } = await import("firebase-admin/firestore");
    await (await adminDb()).doc(`users/${uid}`).set({ createdAt: Timestamp.fromDate(new Date("2025-06-01T00:00:00Z")) });
    expect((await accountCreatedAt(uid, await readProfile(uid)))?.toISOString()).toBe("2025-06-01T00:00:00.000Z");
    // Ni profil ni compte Auth : null, sans erreur.
    const ghost = newUid();
    expect(await accountCreatedAt(ghost, await readProfile(ghost))).toBeNull();
  });

  it("deleteAllShares : supprime les liens du compte, pas ceux des autres ; rejouable", async () => {
    const uid = newUid();
    const other = newUid();
    const mine = await createShare(uid, (await createCollection(uid, "Mémoire", "")).id);
    const theirs = await createShare(other, (await createCollection(other, "Santé", "")).id);
    await deleteAllShares(uid);
    expect(await exists(`shares/${mine}`)).toBe(false);
    expect(await exists(`shares/${theirs}`)).toBe(true);
    await expect(deleteAllShares(uid)).resolves.toBeUndefined();
  });
});
