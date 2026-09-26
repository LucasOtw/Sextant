import "server-only";
import type { DocumentReference, DocumentSnapshot, Firestore, WriteBatch } from "firebase-admin/firestore";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { dateFromTimestamp, millisFromTimestamp } from "@/lib/firebase/decode";
import { forgetRevocationCheck } from "@/lib/auth";
import { deleteAllKeys } from "@/lib/api-keys";
import { detachAuthor, withdrawVotes } from "@/lib/feedback";
import { logError } from "@/lib/log";
import { isKeyUnused, lastActivity, monthsBefore, validMonths } from "@/lib/retention";
import { deleteAllShares } from "@/lib/shares";

/**
 * Module de compte (QUAL-23) : profil `users/{uid}`, suppression du compte et purge des comptes inactifs. Les routes et
 * les pages passent par lui, jamais directement par `users/{uid}`.
 *
 * Données rattachées à un compte, à tenir à jour ici (suppression), dans l'export (api/account/export) et dans la
 * politique de confidentialité :
 * - `users/{uid}` : profil (email, name, picture, createdAt, lastLoginAt, lastKeyUsedAt), `favoriteIds`,
 *   `favoritesCount`, `lastRemovedFavorite` ;
 * - ses sous-collections : `favorites`, `collections`, `highlights`, `notes`, `feedbackVotes` ;
 * - hors de `users/{uid}` : `shares` (champ `uid`), `apiKeys` (champ `uid`), `feedback` (champ `authorUid`) ;
 * - le compte Firebase Authentication.
 */

/** Le document `users/{uid}`, lu une fois par la page « Mon compte » et par l'export. */
export async function readProfile(uid: string): Promise<DocumentSnapshot> {
  return (await adminDb()).doc(`users/${uid}`).get();
}

/**
 * Date d'inscription : celle du profil, sinon celle de Firebase Auth (profil sans date, écriture de connexion ratée).
 * Inconnue : null, jamais d'erreur (un échec de Firebase Auth est journalisé).
 */
export async function accountCreatedAt(uid: string, profile: DocumentSnapshot): Promise<Date | null> {
  const stored = dateFromTimestamp(profile.get("createdAt"));
  if (stored) return stored;
  try {
    const creationTime = (await (await adminAuth()).getUser(uid)).metadata.creationTime;
    const d = creationTime ? new Date(creationTime) : null;
    return d && !Number.isNaN(d.getTime()) ? d : null;
  } catch (e) {
    logError("account.createdAt", e);
    return null;
  }
}

/**
 * Profil minimal, créé ou rafraîchi à chaque connexion (une seule écriture). Un profil non écrit ne bloque pas la
 * connexion (le cookie suffit), mais la panne est journalisée.
 */
export async function recordLogin(decoded: DecodedIdToken): Promise<void> {
  const db = await adminDb();
  const { FieldValue, Timestamp } = await import("firebase-admin/firestore");
  // Date d'inscription : celle de Firebase Auth, identique à chaque connexion. La réécrire ne change donc rien, et
  // un profil créé avant ce correctif retrouve sa vraie date à la connexion suivante.
  const creationTime = await (await adminAuth())
    .getUser(decoded.uid)
    .then((u) => u.metadata.creationTime)
    .catch((e) => {
      logError("session.getUser", e);
      return undefined;
    });
  const createdAt = creationTime ? new Date(creationTime) : null;
  await db
    .doc(`users/${decoded.uid}`)
    .set(
      {
        email: decoded.email ?? null,
        name: decoded.name ?? null,
        picture: decoded.picture ?? null,
        lastLoginAt: FieldValue.serverTimestamp(),
        ...(createdAt && !Number.isNaN(createdAt.getTime()) ? { createdAt: Timestamp.fromDate(createdAt) } : {}),
      },
      { merge: true },
    )
    .catch((e) => logError("session.profile", e));
}

/**
 * Efface un compte : liens de partage (hors de `users/{uid}`), clés d'assistant IA, rattachement des sujets « Bugs et
 * idées », votes (retirés des compteurs), puis `users/{uid}` et tout ce qu'il contient, et enfin le compte Firebase Auth.
 * Commun à « Supprimer mon compte » (DELETE /api/auth/account) et à la purge des comptes inactifs (NEW-14).
 * Chaque étape peut être rejouée après un échec : aucune ne compte deux fois. Un échec est journalisé ici, avec
 * l'étape en cause, puis relancé. Le cache de /retours n'est pas vidé ici : c'est à l'appelant
 * (`refreshFeedbackList`), une fois pour toutes les suppressions.
 */
export async function deleteAccountData(uid: string): Promise<void> {
  let step = "shares";
  try {
    await deleteAllShares(uid);
    step = "apiKeys";
    await deleteAllKeys(uid);
    step = "feedback.author";
    await detachAuthor(uid);
    // Avant l'effacement de users/{uid}, qui contient la liste des votes : sinon ils resteraient comptés (SEC-14).
    step = "feedback.votes";
    await withdrawVotes(uid);
    step = "users";
    const db = await adminDb();
    await db.recursiveDelete(db.doc(`users/${uid}`));
    step = "auth";
    await (await adminAuth()).deleteUser(uid);
  } catch (e) {
    logError("account.delete", e, { step });
    throw e;
  }
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
    } catch {
      // Un compte en échec (journalisé par deleteAccountData) n'arrête pas la purge : il sera repris au passage
      // suivant (chaque étape est rejouable).
      report.failed++;
    }
  }
  return report;
}
