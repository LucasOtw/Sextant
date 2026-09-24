import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createFeedback } from "@/lib/feedback";
import { sanitizeFeedback } from "@/lib/feedback-shared";
import { rateLimit } from "@/lib/rate-limit";
import { rejectCrossSite, rejectLargeBody } from "@/lib/security";
import { logError } from "@/lib/log";

export const runtime = "nodejs";

/** Publie un bug ou une idée. Corps : { kind: "bug" | "idea", title, description }. */
export async function POST(req: Request) {
  const refused = rejectCrossSite(req) ?? rejectLargeBody(req, 16_384);
  if (refused) return refused;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Connectez-vous pour publier." }, { status: 401 });
  if (!rateLimit(`feedback-post:${user.uid}`, 5, 60 * 60_000)) return NextResponse.json({ error: "Vous avez publié plusieurs sujets récemment : réessayez dans une heure." }, { status: 429 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const input = sanitizeFeedback(body);
  if (!input) return NextResponse.json({ error: "Choisissez Bug ou Idée et donnez un titre d'au moins 5 caractères." }, { status: 400 });
  try {
    return NextResponse.json({ item: await createFeedback(user.uid, input) }, { status: 201, headers: { "cache-control": "private, no-store" } });
  } catch (e) {
    logError("feedback.POST", e);
    return NextResponse.json({ error: "La publication a échoué." }, { status: 502 });
  }
}
