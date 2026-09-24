import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";
import { API_KEY_FORMAT, MAX_API_KEYS, type ApiKeyInfo } from "@/lib/api-keys-shared";

/**
 * `apiKeys/{sha256(clé)}` = { uid, name, prefix, createdAt, lastUsedAt }. Seule l'empreinte est stockée :
 * la clé n'est montrée qu'une fois, à sa création. Collection de premier niveau pour retrouver l'utilisateur en une lecture.
 */

export class ApiKeysLimitError extends Error {}

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function toInfo(id: string, data: Record<string, unknown>): ApiKeyInfo {
  const ts = (v: unknown) => (v as { toDate?: () => Date } | undefined)?.toDate?.().toISOString() ?? null;
  return { id, name: String(data.name ?? ""), prefix: String(data.prefix ?? ""), createdAt: ts(data.createdAt), lastUsedAt: ts(data.lastUsedAt) };
}

export async function listKeys(uid: string): Promise<ApiKeyInfo[]> {
  const db = await adminDb();
  const snap = await db.collection("apiKeys").where("uid", "==", uid).get();
  return snap.docs.map((d) => toInfo(d.id, d.data())).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

/** Crée une clé et la renvoie en clair, une seule fois. */
export async function createKey(uid: string, name: string): Promise<{ key: string; info: ApiKeyInfo }> {
  const db = await adminDb();
  const { FieldValue } = await import("firebase-admin/firestore");
  const key = `sxt_${randomBytes(32).toString("base64url")}`;
  const id = hashKey(key);
  const prefix = key.slice(0, 10);
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(db.collection("apiKeys").where("uid", "==", uid));
    if (existing.size >= MAX_API_KEYS) throw new ApiKeysLimitError(`Limite de ${MAX_API_KEYS} clés atteinte : révoquez-en une.`);
    tx.set(db.doc(`apiKeys/${id}`), { uid, name, prefix, createdAt: FieldValue.serverTimestamp(), lastUsedAt: null });
  });
  return { key, info: { id, name, prefix, createdAt: new Date().toISOString(), lastUsedAt: null } };
}

export async function revokeKey(uid: string, id: string): Promise<boolean> {
  const db = await adminDb();
  const ref = db.doc(`apiKeys/${id}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get("uid") !== uid) return false;
    tx.delete(ref);
    return true;
  });
}

/** L'utilisateur derrière une clé, ou null. Note la dernière utilisation au plus une fois par heure. */
export async function verifyKey(key: string): Promise<{ uid: string; keyId: string } | null> {
  if (!API_KEY_FORMAT.test(key)) return null;
  const db = await adminDb();
  const id = hashKey(key);
  const snap = await db.doc(`apiKeys/${id}`).get();
  const uid = snap.get("uid");
  if (!snap.exists || typeof uid !== "string") return null;
  const last = (snap.get("lastUsedAt") as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;
  if (Date.now() - last > 60 * 60 * 1000) {
    const { FieldValue } = await import("firebase-admin/firestore");
    void snap.ref.update({ lastUsedAt: FieldValue.serverTimestamp() }).catch(() => undefined);
  }
  return { uid, keyId: id };
}

/** Suppression du compte : toutes ses clés. */
export async function deleteAllKeys(uid: string): Promise<void> {
  const db = await adminDb();
  const snap = await db.collection("apiKeys").where("uid", "==", uid).get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}
