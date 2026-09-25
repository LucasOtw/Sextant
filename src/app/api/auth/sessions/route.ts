import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { forgetRevocationCheck, getCurrentUserStrict, isAuthEnabled, SESSION_COOKIE } from "@/lib/auth";
import { deleteAllKeys } from "@/lib/api-keys";
import { rateLimit } from "@/lib/rate-limit";
import { rejectCrossSite } from "@/lib/security";
import { logError } from "@/lib/log";
import { setSessionHint } from "@/lib/session-shared";

export const runtime = "nodejs";

/**
 * « Se déconnecter de tous les appareils » (SEC-08) : révoque les jetons Firebase du compte (un cookie de session
 * copié ailleurs ne permet plus ni de lire ni d'écrire, au plus 5 minutes après : lib/auth.ts),
 * supprime les clés MCP (une clé créée avec un cookie volé survivrait sinon à la révocation), puis efface le cookie
 * de cet appareil. Pas de ré-authentification : la victime d'un vol doit pouvoir couper l'accès sans délai.
 */
export async function DELETE(req: Request) {
  const refused = rejectCrossSite(req);
  if (refused) return refused;
  if (!isAuthEnabled()) return NextResponse.json({ error: "Comptes désactivés." }, { status: 503 });
  const user = await getCurrentUserStrict();
  if (!user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  if (!rateLimit(`sessions-revoke:${user.uid}`, 3, 60_000)) return NextResponse.json({ error: "Trop de requêtes, réessayez dans une minute." }, { status: 429 });
  try {
    // D'abord la révocation : si la suppression des clés échoue ensuite, verifyKey refuse déjà les clés créées avant.
    await (await adminAuth()).revokeRefreshTokens(user.uid);
    forgetRevocationCheck(user.uid);
    await deleteAllKeys(user.uid);
  } catch (e) {
    logError("auth.sessions.DELETE", e);
    return NextResponse.json({ error: "La déconnexion des autres appareils a échoué, réessayez." }, { status: 502 });
  }
  const res = NextResponse.json({ ok: true }, { headers: { "cache-control": "private, no-store" } });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  setSessionHint(res, "off");
  return res;
}
