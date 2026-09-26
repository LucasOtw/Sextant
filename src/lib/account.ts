import "server-only";
import type { DocumentReference } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
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

const toMillis = (v: unknown): number | null => (v as { toMillis?: () => number } | null | undefined)?.toMillis?.() ?? null;

/**
 * Purge des données dormantes (NEW-14), selon les durées de lib/retention.ts :
 * - clés : supprimées quand leur dernier usage (ou leur création, si elles n'ont jamais servi) dépasse la durée ;
 * - comptes : supprimés, avec toutes leurs données, quand ni la dernière connexion Google (Firebase Auth, plus fiable
 *   que `users.lastLoginAt` : couvre aussi un profil Firestore absent), ni la création du compte, ni l'usage d'une de
 *   ses clés ne tombent dans la durée. Un utilisateur qui ne passe que par un assistant IA reste donc actif.
 * Une date inconnue ne fait jamais supprimer. Les clés sont toutes lues en une fois (quelques-unes par compte au plus).
 */
export async function purgeInactive(o: PurgeOptions): Promise<PurgeReport> {
  const accountMonths = validMonths(o.accountMonths);
  const keyMonths = validMonths(o.keyMonths);
  const report: PurgeReport = { dryRun: o.dryRun, keys: 0, accounts: 0, truncated: false, failed: 0 };
  if (accountMonths === null && keyMonths === null) return report;
  const db = await adminDb();

  // Dernière activité par compte d'après ses clés, relevée avant toute suppression de clé.
  const keySnap = await db.collection("apiKeys").select("uid", "createdAt", "lastUsedAt").get();
  const keyActivity = new Map<string, number>();
  const unusedKeys: DocumentReference[] = [];
  const keyCutoff = keyMonths === null ? null : monthsBefore(o.now, keyMonths);
  for (const d of keySnap.docs) {
    const uid = d.get("uid");
    if (typeof uid !== "string") continue;
    const key = { createdAt: toMillis(d.get("createdAt")), lastUsedAt: toMillis(d.get("lastUsedAt")) };
    keyActivity.set(uid, Math.max(keyActivity.get(uid) ?? 0, lastActivity(key.lastUsedAt, key.createdAt)));
    if (keyCutoff !== null && isKeyUnused(key, keyCutoff)) unusedKeys.push(d.ref);
  }
  report.keys = unusedKeys.length;
  if (!o.dryRun) {
    // Lots de 500 écritures, la limite d'un batch Firestore.
    for (let i = 0; i < unusedKeys.length; i += 500) {
      const batch = db.batch();
      unusedKeys.slice(i, i + 500).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
  }

  if (accountMonths === null) return report;
  const cutoff = monthsBefore(o.now, accountMonths);
  const inactive: string[] = [];
  const auth = await adminAuth();
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) {
      const date = (s: string | null | undefined) => (s ? Date.parse(s) : null);
      const last = lastActivity(date(u.metadata.lastSignInTime), date(u.metadata.lastRefreshTime), date(u.metadata.creationTime), keyActivity.get(u.uid));
      if (last > 0 && last < cutoff) inactive.push(u.uid);
    }
    pageToken = page.pageToken;
  } while (pageToken);

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
