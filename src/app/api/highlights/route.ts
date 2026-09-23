import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { WORK_ID } from "@/lib/favorites-shared";
import { createHighlight, HighlightsLimitError, listHighlights } from "@/lib/highlights";
import { MAX_HIGHLIGHT_TEXT, sanitizeHighlightInput, tooLong } from "@/lib/highlights-shared";
import { rateLimit } from "@/lib/rate-limit";
import { rejectCrossSite, rejectLargeBody } from "@/lib/security";

export const runtime = "nodejs";
const PRIVATE = { "cache-control": "private, no-store" };
const tooMany = (uid: string) => !rateLimit(`highlights:${uid}`, 90, 60_000);
const TOO_MANY = () => NextResponse.json({ error: "Trop de requêtes, réessayez dans une minute." }, { status: 429 });

/** Surlignages de l'utilisateur ; `?workId=W…` pour ceux d'un article. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  if (tooMany(user.uid)) return TOO_MANY();
  const workId = new URL(req.url).searchParams.get("workId");
  if (workId && !WORK_ID.test(workId)) return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  try {
    return NextResponse.json({ highlights: await listHighlights(user.uid, workId ?? undefined) }, { headers: PRIVATE });
  } catch {
    return NextResponse.json({ error: "Surlignages indisponibles." }, { status: 502 });
  }
}

/** Enregistre un passage. Corps : { text, page?, note?, source, prefix?, suffix?, article }. */
export async function POST(req: Request) {
  const refused = rejectCrossSite(req) ?? rejectLargeBody(req, 32_768);
  if (refused) return refused;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  if (tooMany(user.uid)) return TOO_MANY();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  if (body && typeof body === "object" && tooLong((body as { text?: unknown }).text, MAX_HIGHLIGHT_TEXT)) {
    return NextResponse.json({ error: `Passage trop long (${MAX_HIGHLIGHT_TEXT} caractères au plus).` }, { status: 400 });
  }
  const input = sanitizeHighlightInput(body);
  if (!input) return NextResponse.json({ error: "Passage ou article invalide." }, { status: 400 });
  try {
    return NextResponse.json({ highlight: await createHighlight(user.uid, input) }, { status: 201, headers: PRIVATE });
  } catch (e) {
    if (e instanceof HighlightsLimitError) return NextResponse.json({ error: e.message }, { status: 409 });
    return NextResponse.json({ error: "L'enregistrement a échoué." }, { status: 502 });
  }
}
