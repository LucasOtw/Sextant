import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { logError } from "@/lib/log";
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

/**
 * État du compte Firebase derrière une clé, mémorisé 5 minutes par uid et par instance (même délai que le contrôle
 * de révocation des sessions, lib/auth.ts). `validAfter` = dernière révocation des jetons (ms), 0 si inconnue.
 */
const ACCOUNT_CHECK_TTL_MS = 5 * 60 * 1000;
const accountCache = new Map<string, { active: boolean; validAfter: number; until: number }>();

/** Oublie l'état mémorisé (tests, ou après une révocation faite sur cette instance). */
export function forgetAccountState(uid?: string): void {
  if (uid) accountCache.delete(uid);
  else accountCache.clear();
}

async function accountState(uid: string): Promise<{ active: boolean; validAfter: number }> {
  const cached = accountCache.get(uid);
  if (cached && cached.until > Date.now()) return cached;
  let state: { active: boolean; validAfter: number };
  try {
    const user = await (await adminAuth()).getUser(uid);
    const validAfter = user.tokensValidAfterTime ? Date.parse(user.tokensValidAfterTime) : 0;
    state = { active: !user.disabled, validAfter: Number.isFinite(validAfter) ? validAfter : 0 };
  } catch (e) {
    // Compte supprimé (depuis la console, sans passer par « Supprimer mon compte ») : les clés orphelines sont refusées.
    if ((e as { code?: unknown } | null)?.code !== "auth/user-not-found") throw e;
    state = { active: false, validAfter: 0 };
  }
  if (accountCache.size > 1000) accountCache.clear();
  accountCache.set(uid, { ...state, until: Date.now() + ACCOUNT_CHECK_TTL_MS });
  return state;
}

/**
 * L'utilisateur derrière une clé, ou null. Note la dernière utilisation au plus une fois par heure.
 * Comme les sessions web (SEC-11), une clé est refusée si le compte Firebase est désactivé ou supprimé, ou si elle a
 * été créée avant la dernière révocation des jetons (« Se déconnecter de tous les appareils », ou `revokeRefreshTokens`
 * depuis la console) : une clé fabriquée avec un cookie volé ne survit pas à la révocation. Délai de prise en compte :
 * 5 minutes au plus. Échec fermé : si Firebase Auth ne répond pas, la clé est refusée pour cette requête.
 */
export async function verifyKey(key: string): Promise<{ uid: string; keyId: string } | null> {
  if (!API_KEY_FORMAT.test(key)) return null;
  const db = await adminDb();
  const id = hashKey(key);
  const snap = await db.doc(`apiKeys/${id}`).get();
  const uid = snap.get("uid");
  if (!snap.exists || typeof uid !== "string") return null;
  let account: { active: boolean; validAfter: number };
  try {
    account = await accountState(uid);
  } catch (e) {
    logError("mcp.accountState", e);
    return null;
  }
  if (!account.active) return null;
  // Une clé sans date de création (aucune ne devrait l'être) n'est pas refusée pour autant : compatibilité.
  const createdAt = (snap.get("createdAt") as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;
  if (createdAt && account.validAfter && createdAt < account.validAfter) return null;
  const last = (snap.get("lastUsedAt") as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;
  if (Date.now() - last > 60 * 60 * 1000) {
    const { FieldValue } = await import("firebase-admin/firestore");
    // Attendue (quelques dizaines de ms, une fois par heure et par clé) : une écriture lancée sans attente peut être
    // coupée quand la fonction serverless est gelée après la réponse. Un échec n'empêche pas l'accès, mais laisse une trace :
    // « Utilisée le … » est l'indice qui permet de repérer une clé exposée.
    await snap.ref.update({ lastUsedAt: FieldValue.serverTimestamp() }).catch((e) => logError("mcp.lastUsedAt", e));
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
