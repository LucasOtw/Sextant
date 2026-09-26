import { after, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { forgetRevocationCheck, requireStrictUser, isAuthEnabled, SESSION_COOKIE } from "@/lib/auth";
import { deleteAllKeys } from "@/lib/api-keys";
import { overLimit, PRIVATE, tooMany } from "@/lib/api/guard";
import { rejectCrossSite } from "@/lib/security";
import { logError } from "@/lib/log";
import { setSessionHint } from "@/lib/session-shared";

export const runtime = "nodejs";

/**
 * « Se déconnecter de tous les appareils » (SEC-08) : révoque les jetons Firebase du compte (un cookie de session
 * copié ailleurs ne permet plus ni de lire ni d'écrire, au plus 5 minutes après : lib/auth.ts),
 * supprime les clés MCP (une clé créée avec un cookie volé survivrait sinon à la révocation), puis efface le cookie
 * de cet appareil. Pas de ré-authentification : la victime d'un vol doit pouvoir couper l'accès sans délai.
 *
 * Deux étapes distinctes. Si la révocation échoue, rien n'a changé : 502, cookie gardé, l'utilisateur réessaie. Si
 * elle réussit, le cookie de cet appareil est révoqué lui aussi : il est toujours effacé, même quand la suppression des
 * clés échoue ensuite. Ces clés sont déjà refusées par verifyKey (créées avant la révocation, ou rattachées à une session
 * antérieure) : la réponse est 200 avec `keysPending`, et la suppression est retentée une fois après la réponse.
 */
export async function DELETE(req: Request) {
  const refused = rejectCrossSite(req);
  if (refused) return refused;
  if (!isAuthEnabled()) return NextResponse.json({ error: "Comptes désactivés." }, { status: 503 });
  const { ok, user, refused: denied } = await requireStrictUser();
  if (!ok) return denied;
  if (overLimit("sessions-revoke", user.uid)) return tooMany();
  try {
    await (await adminAuth()).revokeRefreshTokens(user.uid);
  } catch (e) {
    logError("auth.sessions.DELETE", e);
    return NextResponse.json({ error: "La déconnexion des autres appareils a échoué, réessayez." }, { status: 502 });
  }
  forgetRevocationCheck(user.uid);
  let keysPending = false;
  try {
    await deleteAllKeys(user.uid);
  } catch (e) {
    logError("auth.sessions.deleteKeys", e);
    keysPending = true;
    // Nouvel essai après la réponse : l'utilisateur ne peut plus le relancer lui-même (son cookie est révoqué).
    after(() => deleteAllKeys(user.uid).catch((err) => logError("auth.sessions.deleteKeys.retry", err)));
  }
  const res = NextResponse.json(keysPending ? { ok: true, keysPending: true } : { ok: true }, { headers: PRIVATE });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  setSessionHint(res, "off");
  return res;
}
