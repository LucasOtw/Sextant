import { NextResponse } from "next/server";
import { deleteAccountData } from "@/lib/account";
import { isRecentLogin, reauthRequired, SESSION_COOKIE } from "@/lib/auth";
import { requireUser } from "@/lib/api/guard";
import { refreshFeedbackList } from "@/lib/feedback";
import { logError } from "@/lib/log";
import { setSessionHint } from "@/lib/session-shared";

export const runtime = "nodejs";

/**
 * Supprime le compte de l'utilisateur connecté : données Firestore puis compte Firebase Auth (`deleteAccountData`,
 * lib/account.ts). Exige une connexion Google de moins de 10 minutes (SEC-09) : un cookie de session copié ne suffit
 * pas à détruire un compte.
 */
export async function DELETE(req: Request) {
  const { user, refused } = await requireUser(req, { bucket: "account-del" });
  if (refused) return refused;
  if (!isRecentLogin(user)) return reauthRequired();

  try {
    await deleteAccountData(user.uid);
  } catch (e) {
    logError("auth.account.DELETE", e);
    // Des votes ont pu être retirés avant l'échec : la liste publique est relue quand même.
    refreshFeedbackList("auth.account.invalidate");
    return NextResponse.json({ error: "La suppression a échoué, réessayez." }, { status: 500 });
  }
  // Hors du chemin critique : une invalidation du cache qui échoue ne doit pas couper la suppression en plein milieu.
  refreshFeedbackList("auth.account.invalidate");

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  setSessionHint(res, "off");
  return res;
}
