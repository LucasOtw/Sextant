import { NextResponse } from "next/server";
import { PRIVATE, requireUser, serverError } from "@/lib/api/guard";
import { FeedbackNotFoundError, refreshFeedbackList, toggleVote } from "@/lib/feedback";

export const runtime = "nodejs";

/** Ajoute ou retire son vote. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, refused } = await requireUser(req, { bucket: "feedback-vote", signInMessage: "Connectez-vous pour voter." });
  if (refused) return refused;
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9]{1,40}$/.test(id)) return NextResponse.json({ error: "Sujet invalide." }, { status: 400 });
  try {
    const result = await toggleVote(user.uid, id);
    // Sinon un rechargement dans la minute afficherait l'état « voté » (lu à jour) à côté d'un compteur ancien.
    refreshFeedbackList("feedback.vote.invalidate");
    return NextResponse.json(result, { headers: PRIVATE });
  } catch (e) {
    if (e instanceof FeedbackNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    return serverError("feedback.id.vote.POST", e, "Le vote n'a pas pu être enregistré.");
  }
}
