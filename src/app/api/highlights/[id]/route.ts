import { NextResponse } from "next/server";
import { PRIVATE, requireUser, serverError } from "@/lib/api/guard";
import { deleteHighlight, HighlightNotFoundError, updateHighlightNote } from "@/lib/highlights";
import { cleanText, MAX_NOTE } from "@/lib/highlights-shared";

export const runtime = "nodejs";
const ID = /^[A-Za-z0-9_-]{1,64}$/;

type Ctx = { params: Promise<{ id: string }> };

async function guard(req: Request, ctx: Ctx) {
  const { user, refused } = await requireUser(req, { bucket: "highlights", maxBody: 16_384 });
  if (refused) return { refused };
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
    return serverError("highlights.id.PATCH", e, "La modification a échoué.");
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const g = await guard(req, ctx);
  if (g.refused) return g.refused;
  try {
    await deleteHighlight(g.user.uid, g.id);
    return NextResponse.json({ ok: true }, { headers: PRIVATE });
  } catch (e) {
    return serverError("highlights.id.DELETE", e, "La suppression a échoué.");
  }
}
