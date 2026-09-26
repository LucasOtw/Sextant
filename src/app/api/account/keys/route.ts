import { NextResponse } from "next/server";
import { isRecentLogin, reauthRequired, recheckSession } from "@/lib/auth";
import { PRIVATE, requireUser, serverError } from "@/lib/api/guard";
import { ApiKeysLimitError, createKey, listKeys } from "@/lib/api-keys";
import { MAX_API_KEY_NAME } from "@/lib/api-keys-shared";
import { cleanText } from "@/lib/highlights-shared";
import { logError } from "@/lib/log";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { user, refused } = await requireUser(req, { read: true });
  if (refused) return refused;
  try {
    return NextResponse.json({ keys: await listKeys(user.uid) }, { headers: PRIVATE });
  } catch (e) {
    return serverError("account.keys.GET", e, "Clés indisponibles.");
  }
}

/**
 * Crée une clé. Corps : { name }. La réponse est le seul moment où la clé est lisible. Exige une connexion Google de
 * moins de 10 minutes (SEC-09) : une clé survit à la session, un cookie copié ne doit pas suffire à en fabriquer une.
 */
export async function POST(req: Request) {
  const { user, refused } = await requireUser(req, { bucket: "keys", maxBody: 4_096 });
  if (refused) return refused;
  if (!isRecentLogin(user)) return reauthRequired();
  // État du compte relu sans le cache de l'instance : une révocation faite ailleurs il y a moins de 5 minutes compte
  // déjà (un getUser par création de clé). La clé est de toute façon rattachée à la session (sessionAuthTime).
  try {
    if (!(await recheckSession(user))) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  } catch (e) {
    logError("account.keys.recheck", e);
    return NextResponse.json({ error: "Vérification de session momentanément impossible, réessayez." }, { status: 503, headers: { ...PRIVATE, "retry-after": "5" } });
  }
  let name = "";
  try {
    name = cleanText(((await req.json()) as { name?: unknown }).name, MAX_API_KEY_NAME);
  } catch {
    /* corps invalide */
  }
  if (!name) name = "Assistant IA";
  try {
    const { key, info } = await createKey(user.uid, name, user.authTime);
    return NextResponse.json({ key, info }, { status: 201, headers: PRIVATE });
  } catch (e) {
    if (e instanceof ApiKeysLimitError) return NextResponse.json({ error: e.message }, { status: 409 });
    return serverError("account.keys.POST", e, "La clé n'a pas pu être créée.");
  }
}
