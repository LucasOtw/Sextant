import { NextResponse } from "next/server";
import { PRIVATE, requireUser, serverError } from "@/lib/api/guard";
import { createFeedback, refreshFeedbackList } from "@/lib/feedback";
import { MIN_FEEDBACK_TITLE, sanitizeFeedback } from "@/lib/feedback-shared";

export const runtime = "nodejs";

/** Publie un bug ou une idée. Corps : { kind: "bug" | "idea", title, description }. */
export async function POST(req: Request) {
  const { user, refused } = await requireUser(req, {
    bucket: "feedback-post",
    maxBody: 16_384,
    signInMessage: "Connectez-vous pour publier.",
    tooManyMessage: "Vous avez publié plusieurs sujets récemment : réessayez dans une heure.",
  });
  if (refused) return refused;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const input = sanitizeFeedback(body);
  if (!input) return NextResponse.json({ error: `Choisissez Bug ou Idée et donnez un titre d'au moins ${MIN_FEEDBACK_TITLE} caractères.` }, { status: 400 });
  try {
    const item = await createFeedback(user.uid, input);
    refreshFeedbackList("feedback.invalidate");
    return NextResponse.json({ item }, { status: 201, headers: PRIVATE });
  } catch (e) {
    return serverError("feedback.POST", e, "La publication a échoué.");
  }
}
