import { describe, expect, it } from "vitest";
import { adminAuth } from "@/lib/firebase/admin";
import { createKey, forgetAccountState, verifyKey } from "@/lib/api-keys";
import { newUid } from "./helpers";

/** SEC-11 : une clé MCP suit l'état du compte Firebase (émulateurs Auth et Firestore, projet demo-…). */
describe("verifyKey et l'état du compte (émulateurs)", () => {
  it("accepte une clé d'un compte actif, la refuse une fois le compte désactivé", async () => {
    const uid = newUid();
    const auth = await adminAuth();
    await auth.createUser({ uid });
    const { key } = await createKey(uid, "Claude");
    expect(await verifyKey(key)).toMatchObject({ uid });

    await auth.updateUser(uid, { disabled: true });
    forgetAccountState(uid); // sans cela, l'état reste mémorisé 5 minutes sur l'instance
    expect(await verifyKey(key)).toBeNull();
  });

  it("refuse une clé orpheline (compte supprimé sans passer par « Supprimer mon compte »)", async () => {
    const uid = newUid();
    const auth = await adminAuth();
    await auth.createUser({ uid });
    const { key } = await createKey(uid, "Claude");
    await auth.deleteUser(uid);
    forgetAccountState(uid);
    expect(await verifyKey(key)).toBeNull();
  });

  it("une révocation des jetons invalide les clés créées avant, pas celles créées après", async () => {
    const uid = newUid();
    const auth = await adminAuth();
    await auth.createUser({ uid });
    const { key: before } = await createKey(uid, "Avant");
    // `tokensValidAfterTime` est à la seconde : on laisse passer la seconde de création de la première clé.
    await new Promise((r) => setTimeout(r, 1_100));
    await auth.revokeRefreshTokens(uid);
    await new Promise((r) => setTimeout(r, 1_100));
    const { key: after } = await createKey(uid, "Après");
    forgetAccountState(uid);
    expect(await verifyKey(before)).toBeNull();
    expect(await verifyKey(after)).toMatchObject({ uid });
  });
});
