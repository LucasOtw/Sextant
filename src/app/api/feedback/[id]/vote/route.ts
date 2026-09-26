import { NextResponse } from "next/server";
import { getCurrentUserStrict, strictRefusal } from "@/lib/auth";
import { FeedbackNotFoundError, refreshFeedbackList, toggleVote } from "@/lib/feedback";
import { rateLimit } from "@/lib/rate-limit";
import { rejectCrossSite } from "@/lib/security";
import { logError } from "@/lib/log";

export const runtime = "nodejs";

/** Ajoute ou retire son vote. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const refused = rejectCrossSite(req);
  if (refused) return refused;
  const user = await getCurrentUserStrict();
  if (!user) return strictRefusal("Connectez-vous pour voter.");
  if (!rateLimit(`feedback-vote:${user.uid}`, 60, 60_000)) return NextResponse.json({ error: "Trop de requêtes, réessayez dans une minute." }, { status: 429 });
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9]{1,40}$/.test(id)) return NextResponse.json({ error: "Sujet invalide." }, { status: 400 });
  try {
    const result = await toggleVote(user.uid, id);
    // Sinon un rechargement dans la minute afficherait l'état « voté » (lu à jour) à côté d'un compteur ancien.
    refreshFeedbackList("feedback.vote.invalidate");
    return NextResponse.json(result, { headers: { "cache-control": "private, no-store" } });
  } catch (e) {
    if (e instanceof FeedbackNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    logError("feedback.id.vote.POST", e);
    return NextResponse.json({ error: "Le vote n'a pas pu être enregistré." }, { status: 502 });
  }
}
