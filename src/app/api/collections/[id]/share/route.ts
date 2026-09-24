import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { CollectionNotFoundError } from "@/lib/collections";
import { createShare, revokeShare } from "@/lib/shares";
import { rateLimit } from "@/lib/rate-limit";
import { rejectCrossSite } from "@/lib/security";

export const runtime = "nodejs";
const PRIVATE = { "cache-control": "private, no-store" };
const ID = /^[A-Za-z0-9_-]{1,64}$/;

type Ctx = { params: Promise<{ id: string }> };

async function guard(req: Request, ctx: Ctx) {
  const refused = rejectCrossSite(req);
  if (refused) return { refused };
  const user = await getCurrentUser();
  if (!user) return { refused: NextResponse.json({ error: "Non connecté." }, { status: 401 }) };
  if (!rateLimit(`collections:${user.uid}`, 60, 60_000)) return { refused: NextResponse.json({ error: "Trop de requêtes, réessayez dans une minute." }, { status: 429 }) };
  const { id } = await ctx.params;
  if (!ID.test(id)) return { refused: NextResponse.json({ error: "Liste invalide." }, { status: 400 }) };
  return { user, id };
}

/** Active le lien de partage (ou renvoie celui qui existe déjà). */
export async function POST(req: Request, ctx: Ctx) {
  const g = await guard(req, ctx);
  if (g.refused) return g.refused;
  try {
    return NextResponse.json({ shareToken: await createShare(g.user.uid, g.id) }, { status: 201, headers: PRIVATE });
  } catch (e) {
    if (e instanceof CollectionNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    return NextResponse.json({ error: "Le lien n'a pas pu être créé." }, { status: 502 });
  }
}

/** Désactive le lien : il cesse de fonctionner immédiatement. */
export async function DELETE(req: Request, ctx: Ctx) {
  const g = await guard(req, ctx);
  if (g.refused) return g.refused;
  try {
    await revokeShare(g.user.uid, g.id);
    return NextResponse.json({ ok: true }, { headers: PRIVATE });
  } catch (e) {
    if (e instanceof CollectionNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    return NextResponse.json({ error: "Le lien n'a pas pu être désactivé." }, { status: 502 });
  }
}
