import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { FeedbackNotFoundError, toggleVote } from "@/lib/feedback";
import { rateLimit } from "@/lib/rate-limit";
import { rejectCrossSite } from "@/lib/security";
import { logError } from "@/lib/log";

export const runtime = "nodejs";

/** Ajoute ou retire son vote. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const refused = rejectCrossSite(req);
  if (refused) return refused;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Connectez-vous pour voter." }, { status: 401 });
  if (!rateLimit(`feedback-vote:${user.uid}`, 60, 60_000)) return NextResponse.json({ error: "Trop de requêtes, réessayez dans une minute." }, { status: 429 });
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9]{1,40}$/.test(id)) return NextResponse.json({ error: "Sujet invalide." }, { status: 400 });
  try {
    return NextResponse.json(await toggleVote(user.uid, id), { headers: { "cache-control": "private, no-store" } });
  } catch (e) {
    if (e instanceof FeedbackNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    logError("feedback.id.vote.POST", e);
    return NextResponse.json({ error: "Le vote n'a pas pu être enregistré." }, { status: 502 });
  }
}
