import "server-only";
import type { DocumentReference, Firestore, WriteBatch } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { millisFromTimestamp } from "@/lib/firebase/decode";
import { forgetRevocationCheck } from "@/lib/auth";
import { deleteAllKeys } from "@/lib/api-keys";
import { detachAuthor, withdrawVotes } from "@/lib/feedback";
import { logError } from "@/lib/log";
import { isKeyUnused, lastActivity, monthsBefore, validMonths } from "@/lib/retention";

/**
 * Efface un compte : liens de partage (hors de `users/{uid}`), clés d'assistant IA, rattachement des sujets « Bugs et
 * idées », votes (retirés des compteurs), puis `users/{uid}` et tout ce qu'il contient, et enfin le compte Firebase Auth.
 * Commun à « Supprimer mon compte » (DELETE /api/auth/account) et à la purge des comptes inactifs (NEW-14).
 * Chaque étape peut être rejouée après un échec : aucune ne compte deux fois. Le cache de /retours n'est pas vidé
 * ici : c'est à l'appelant (`refreshFeedbackList`), une fois pour toutes les suppressions.
 */
export async function deleteAccountData(uid: string): Promise<void> {
  const db = await adminDb();
  const shares = await db.collection("shares").where("uid", "==", uid).get();
  if (!shares.empty) {
    const batch = db.batch();
    shares.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await deleteAllKeys(uid);
  await detachAuthor(uid);
  // Avant l'effacement de users/{uid}, qui contient la liste des votes : sinon ils resteraient comptés (SEC-14).
  await withdrawVotes(uid);
  await db.recursiveDelete(db.doc(`users/${uid}`));
  await (await adminAuth()).deleteUser(uid);
  forgetRevocationCheck(uid);
}

export interface PurgeOptions {
  /** Instant de référence (ms). */
  now: number;
  /** Durée d'inactivité d'un compte, en mois ; null : aucun compte n'est supprimé. */
  accountMonths: number | null;
  /** Durée sans usage d'une clé, en mois ; null : aucune clé n'est supprimée. */
  keyMonths: number | null;
  /** Compte seulement, sans rien supprimer : à lancer avant d'activer la purge, puisqu'elle est irréversible. */
  dryRun: boolean;
  /** Comptes supprimés au plus par passage (durée de la fonction bornée) ; les suivants attendent le passage d'après. */
  maxAccounts?: number;
}

export interface PurgeReport {
  dryRun: boolean;
  keys: number;
  accounts: number;
  /** Plus de comptes inactifs que `maxAccounts` : il faudra plusieurs passages. */
  truncated: boolean;
  /** Suppressions de compte en échec (journalisées), retentées au passage suivant. */
  failed: number;
}

/** `users/{uid}.lastKeyUsedAt` (ms) des comptes donnés, lus par lots ; absent du résultat si inconnu. */
async function profileKeyUse(db: Firestore, uids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < uids.length; i += 300) {
    const refs = uids.slice(i, i + 300).map((uid) => db.doc(`users/${uid}`));
    if (refs.length === 0) continue;
    const snaps = await db.getAll(...refs, { fieldMask: ["lastKeyUsedAt"] });
    for (const snap of snaps) {
      const t = millisFromTimestamp(snap.get("lastKeyUsedAt"));
      if (t !== null) out.set(snap.id, t);
    }
  }
  return out;
}

/**
 * Purge des données dormantes (NEW-14), selon les durées de lib/retention.ts :
 * - clés : supprimées quand leur dernier usage (ou leur création, si elles n'ont jamais servi) dépasse la durée ;
 * - comptes : supprimés, avec toutes leurs données, quand ni la dernière connexion Google (Firebase Auth, plus fiable
 *   que `users.lastLoginAt` : couvre aussi un profil Firestore absent), ni la création du compte, ni l'usage d'une de
 *   ses clés ne tombent dans la durée. Un utilisateur qui ne passe que par un assistant IA reste donc actif, même après
 *   la purge de ses clés : avant de supprimer une clé, son dernier usage est reporté dans `users/{uid}.lastKeyUsedAt`
 *   (aussi tenu à jour par verifyKey), lu ensuite avec les autres dates.
 * Une date inconnue ne fait jamais supprimer. Les clés sont toutes lues en une fois (quelques-unes par compte au plus).
 */
export async function purgeInactive(o: PurgeOptions): Promise<PurgeReport> {
  const accountMonths = validMonths(o.accountMonths);
  const keyMonths = validMonths(o.keyMonths);
  const report: PurgeReport = { dryRun: o.dryRun, keys: 0, accounts: 0, truncated: false, failed: 0 };
  if (accountMonths === null && keyMonths === null) return report;
  const db = await adminDb();
  const { Timestamp } = await import("firebase-admin/firestore");

  // Dernière activité par compte d'après ses clés, relevée avant toute suppression de clé.
  const keySnap = await db.collection("apiKeys").select("uid", "createdAt", "lastUsedAt").get();
  const keyActivity = new Map<string, number>();
  const unusedKeys: DocumentReference[] = [];
  // Dernier usage des clés purgées, par compte : reporté dans users/{uid} avant leur suppression.
  const purgedActivity = new Map<string, number>();
  const keyCutoff = keyMonths === null ? null : monthsBefore(o.now, keyMonths);
  for (const d of keySnap.docs) {
    const uid = d.get("uid");
    if (typeof uid !== "string") continue;
    const key = { createdAt: millisFromTimestamp(d.get("createdAt")), lastUsedAt: millisFromTimestamp(d.get("lastUsedAt")) };
    const last = lastActivity(key.lastUsedAt, key.createdAt);
    keyActivity.set(uid, Math.max(keyActivity.get(uid) ?? 0, last));
    if (keyCutoff !== null && isKeyUnused(key, keyCutoff)) {
      unusedKeys.push(d.ref);
      purgedActivity.set(uid, Math.max(purgedActivity.get(uid) ?? 0, last));
    }
  }
  report.keys = unusedKeys.length;
  if (!o.dryRun && unusedKeys.length > 0) {
    // La trace d'usage d'abord (jamais reculée), les suppressions ensuite : un échec entre les deux ne perd rien.
    const known = await profileKeyUse(db, [...purgedActivity.keys()]);
    const writes: ((b: WriteBatch) => void)[] = [];
    for (const [uid, last] of purgedActivity) {
      if (last > (known.get(uid) ?? 0)) {
        writes.push((b) => b.set(db.doc(`users/${uid}`), { lastKeyUsedAt: Timestamp.fromMillis(last) }, { merge: true }));
      }
    }
    for (const ref of unusedKeys) writes.push((b) => b.delete(ref));
    // Lots de 500 écritures, la limite d'un batch Firestore.
    for (let i = 0; i < writes.length; i += 500) {
      const batch = db.batch();
      writes.slice(i, i + 500).forEach((w) => w(batch));
      await batch.commit();
    }
  }

  if (accountMonths === null) return report;
  const cutoff = monthsBefore(o.now, accountMonths);
  const candidates: string[] = [];
  const auth = await adminAuth();
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) {
      const date = (s: string | null | undefined) => (s ? Date.parse(s) : null);
      const last = lastActivity(date(u.metadata.lastSignInTime), date(u.metadata.lastRefreshTime), date(u.metadata.creationTime), keyActivity.get(u.uid));
      if (last > 0 && last < cutoff) candidates.push(u.uid);
    }
    pageToken = page.pageToken;
  } while (pageToken);
  // Usage de clés déjà purgées lors d'un passage précédent : relu dans le profil des seuls candidats.
  const pastKeyUse = await profileKeyUse(db, candidates);
  const inactive = candidates.filter((uid) => (pastKeyUse.get(uid) ?? 0) < cutoff);

  const max = o.maxAccounts ?? 50;
  report.truncated = inactive.length > max;
  // À blanc : tous les comptes concernés (un vrai passage n'en traiterait que `max`, cf. truncated).
  if (o.dryRun) {
    report.accounts = inactive.length;
    return report;
  }
  for (const uid of inactive.slice(0, max)) {
    try {
      await deleteAccountData(uid);
      report.accounts++;
    } catch (e) {
      // Un compte en échec n'arrête pas la purge : il sera repris au passage suivant (chaque étape est rejouable).
      logError("retention.deleteAccount", e);
      report.failed++;
    }
  }
  return report;
}
