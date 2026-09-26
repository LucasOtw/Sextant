import { NextResponse } from "next/server";
import { requireStrictUser } from "@/lib/auth";
import { deleteHighlight, HighlightNotFoundError, updateHighlightNote } from "@/lib/highlights";
import { cleanText, MAX_NOTE } from "@/lib/highlights-shared";
import { rateLimit } from "@/lib/rate-limit";
import { rejectCrossSite, rejectLargeBody } from "@/lib/security";
import { logError } from "@/lib/log";

export const runtime = "nodejs";
const PRIVATE = { "cache-control": "private, no-store" };
const ID = /^[A-Za-z0-9_-]{1,64}$/;

type Ctx = { params: Promise<{ id: string }> };

async function guard(req: Request, ctx: Ctx) {
  const refused = rejectCrossSite(req) ?? rejectLargeBody(req);
  if (refused) return { refused };
  const { ok, user, refused: denied } = await requireStrictUser();
  if (!ok) return { refused: denied };
  if (!rateLimit(`highlights:${user.uid}`, 90, 60_000)) return { refused: NextResponse.json({ error: "Trop de requêtes, réessayez dans une minute." }, { status: 429 }) };
  const { id } = await ctx.params;
  if (!ID.test(id)) return { refused: NextResponse.json({ error: "Surlignage invalide." }, { status: 400 }) };
  return { user, id };
}

/** Modifie la note. Corps : { note } (vide pour l'effacer). */
export async function PATCH(req: Request, ctx: Ctx) {
  const g = await guard(req, ctx);
  if (g.refused) return g.refused;
  let note = "";
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body) || typeof (body as { note?: unknown }).note !== "string") {
      return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
    }
    note = cleanText((body as { note: string }).note, MAX_NOTE, true);
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  try {
    await updateHighlightNote(g.user.uid, g.id, note);
    return NextResponse.json({ ok: true, note }, { headers: PRIVATE });
  } catch (e) {
    if (e instanceof HighlightNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    logError("highlights.id.PATCH", e);
    return NextResponse.json({ error: "La modification a échoué." }, { status: 502 });
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const g = await guard(req, ctx);
  if (g.refused) return g.refused;
  try {
    await deleteHighlight(g.user.uid, g.id);
    return NextResponse.json({ ok: true }, { headers: PRIVATE });
  } catch (e) {
    logError("highlights.id.DELETE", e);
    return NextResponse.json({ error: "La suppression a échoué." }, { status: 502 });
  }
}
