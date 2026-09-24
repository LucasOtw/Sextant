import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ApiKeysLimitError, createKey, listKeys } from "@/lib/api-keys";
import { MAX_API_KEY_NAME } from "@/lib/api-keys-shared";
import { cleanText } from "@/lib/highlights-shared";
import { rateLimit } from "@/lib/rate-limit";
import { rejectCrossSite, rejectLargeBody } from "@/lib/security";

export const runtime = "nodejs";
const PRIVATE = { "cache-control": "private, no-store" };

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  try {
    return NextResponse.json({ keys: await listKeys(user.uid) }, { headers: PRIVATE });
  } catch {
    return NextResponse.json({ error: "Clés indisponibles." }, { status: 502 });
  }
}

/** Crée une clé. Corps : { name }. La réponse est le seul moment où la clé est lisible. */
export async function POST(req: Request) {
  const refused = rejectCrossSite(req) ?? rejectLargeBody(req, 4_096);
  if (refused) return refused;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  if (!rateLimit(`keys:${user.uid}`, 10, 60_000)) return NextResponse.json({ error: "Trop de requêtes, réessayez dans une minute." }, { status: 429 });
  let name = "";
  try {
    name = cleanText(((await req.json()) as { name?: unknown }).name, MAX_API_KEY_NAME);
  } catch {
    /* corps invalide */
  }
  if (!name) name = "Assistant IA";
  try {
    const { key, info } = await createKey(user.uid, name);
    return NextResponse.json({ key, info }, { status: 201, headers: PRIVATE });
  } catch (e) {
    if (e instanceof ApiKeysLimitError) return NextResponse.json({ error: e.message }, { status: 409 });
    return NextResponse.json({ error: "La clé n'a pas pu être créée." }, { status: 502 });
  }
}
