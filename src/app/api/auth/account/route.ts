import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { forgetRevocationCheck, getCurrentUserStrict, isRecentLogin, reauthRequired, SESSION_COOKIE } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { rejectCrossSite } from "@/lib/security";
import { deleteAllKeys } from "@/lib/api-keys";
import { detachAuthor, invalidateFeedbackList, withdrawVotes } from "@/lib/feedback";
import { logError } from "@/lib/log";
import { setSessionHint } from "@/lib/session-shared";

export const runtime = "nodejs";

/**
 * Supprime le compte de l'utilisateur connecté : données Firestore puis compte Firebase Auth. Exige une connexion
 * Google de moins de 10 minutes (SEC-09) : un cookie de session copié ne suffit pas à détruire un compte.
 */
export async function DELETE(req: Request) {
  const refused = rejectCrossSite(req);
  if (refused) return refused;
  const user = await getCurrentUserStrict();
  if (!user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  if (!rateLimit(`account-del:${user.uid}`, 3, 60_000)) return NextResponse.json({ error: "Trop de requêtes, réessayez dans une minute." }, { status: 429 });
  if (!isRecentLogin(user)) return reauthRequired();

  try {
    const db = await adminDb();
    // Les liens de partage vivent hors de users/{uid} : on les supprime d'abord, puis tout le reste du compte.
    const shares = await db.collection("shares").where("uid", "==", user.uid).get();
    if (!shares.empty) {
      const batch = db.batch();
      shares.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    await deleteAllKeys(user.uid);
    await detachAuthor(user.uid);
    // Avant l'effacement de users/{uid}, qui contient la liste des votes : sinon ils resteraient comptés (SEC-14).
    await withdrawVotes(user.uid);
    invalidateFeedbackList();
    await db.recursiveDelete(db.doc(`users/${user.uid}`));
    await (await adminAuth()).deleteUser(user.uid);
    forgetRevocationCheck(user.uid);
  } catch (e) {
    logError("auth.account.DELETE", e);
    return NextResponse.json({ error: "La suppression a échoué, réessayez." }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  setSessionHint(res, "off");
  return res;
}
