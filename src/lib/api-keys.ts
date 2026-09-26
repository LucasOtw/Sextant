import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";
import { accountState, type AccountState } from "@/lib/account-state";
import { logError } from "@/lib/log";
import { API_KEY_FORMAT, MAX_API_KEYS, type ApiKeyInfo } from "@/lib/api-keys-shared";

/** Réexporté pour les tests et les routes : l'état du compte est mémorisé dans lib/account-state.ts. */
export { forgetAccountState } from "@/lib/account-state";

/**
 * `apiKeys/{sha256(clé)}` = { uid, name, prefix, createdAt, lastUsedAt, sessionAuthTime }. Seule l'empreinte est
 * stockée : la clé n'est montrée qu'une fois, à sa création. Collection de premier niveau pour retrouver l'utilisateur
 * en une lecture. `sessionAuthTime` = date de connexion Google (s) de la session qui a créé la clé : la clé tombe avec
 * cette session quand les jetons sont révoqués (absent des clés créées avant ce champ).
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

/**
 * Crée une clé et la renvoie en clair, une seule fois. `sessionAuthTime` (claim `auth_time` de la session qui la crée)
 * rattache la clé à cette session : une révocation postérieure à cette connexion la refuse, même si la clé a été écrite
 * après la révocation par une instance dont l'état du compte mémorisé était encore l'ancien.
 */
export async function createKey(uid: string, name: string, sessionAuthTime?: number): Promise<{ key: string; info: ApiKeyInfo }> {
  const db = await adminDb();
  const { FieldValue } = await import("firebase-admin/firestore");
  const key = `sxt_${randomBytes(32).toString("base64url")}`;
  const id = hashKey(key);
  const prefix = key.slice(0, 10);
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(db.collection("apiKeys").where("uid", "==", uid));
    if (existing.size >= MAX_API_KEYS) throw new ApiKeysLimitError(`Limite de ${MAX_API_KEYS} clés atteinte : révoquez-en une.`);
    tx.set(db.doc(`apiKeys/${id}`), {
      uid,
      name,
      prefix,
      createdAt: FieldValue.serverTimestamp(),
      lastUsedAt: null,
      ...(sessionAuthTime !== undefined && Number.isFinite(sessionAuthTime) ? { sessionAuthTime } : {}),
    });
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
 * L'utilisateur derrière une clé, ou null. Note la dernière utilisation au plus une fois par heure.
 * Comme les sessions web (SEC-11), une clé est refusée si le compte Firebase est désactivé ou supprimé, ou si elle a
 * été créée avant la dernière révocation des jetons (« Se déconnecter de tous les appareils », ou `revokeRefreshTokens`
 * depuis la console), ou si la session qui l'a créée est antérieure à cette révocation (`sessionAuthTime`) : une clé
 * fabriquée avec un cookie volé ne survit pas à la révocation. Délai de prise en compte : 5 minutes au plus.
 * Échec fermé : si Firebase Auth ne répond pas, l'erreur remonte (la route répond 503 avec Retry-After), et non null,
 * qu'un client MCP lirait comme une clé révoquée.
 */
export async function verifyKey(key: string): Promise<{ uid: string; keyId: string } | null> {
  if (!API_KEY_FORMAT.test(key)) return null;
  const db = await adminDb();
  const id = hashKey(key);
  const snap = await db.doc(`apiKeys/${id}`).get();
  const uid = snap.get("uid");
  if (!snap.exists || typeof uid !== "string") return null;
  // Firebase Auth injoignable : l'erreur remonte, sans être mémorisée (lib/account-state.ts).
  const account: AccountState = await accountState(uid);
  if (!account.active) return null;
  // Une clé sans date de création (aucune ne devrait l'être) n'est pas refusée pour autant : compatibilité.
  const createdAt = (snap.get("createdAt") as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;
  if (createdAt && account.validAfter && createdAt < account.validAfter) return null;
  // Session créatrice antérieure à la révocation : refusée, quelle que soit la date d'écriture de la clé. Les clés
  // sans ce champ (créées avant) gardent le seul contrôle sur createdAt.
  const sessionAuthTime = snap.get("sessionAuthTime");
  if (typeof sessionAuthTime === "number" && account.validAfter && sessionAuthTime * 1000 < account.validAfter) return null;
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
