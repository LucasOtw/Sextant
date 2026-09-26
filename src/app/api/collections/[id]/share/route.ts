import { NextResponse } from "next/server";
import { PRIVATE, requireUser, serverError } from "@/lib/api/guard";
import { DOC_ID } from "@/lib/ids";
import { CollectionNotFoundError } from "@/lib/collections";
import { createShare, revokeShare } from "@/lib/shares";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Même seau que la gestion des listes. Pas de corps à contrôler. */
async function guard(req: Request, ctx: Ctx) {
  const { user, refused } = await requireUser(req, { bucket: "collections" });
  if (refused) return { refused };
  const { id } = await ctx.params;
  if (!DOC_ID.test(id)) return { refused: NextResponse.json({ error: "Liste invalide." }, { status: 400 }) };
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
    return serverError("collections.id.share.POST", e, "Le lien n'a pas pu être créé.");
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
    return serverError("collections.id.share.DELETE", e, "Le lien n'a pas pu être désactivé.");
  }
}
