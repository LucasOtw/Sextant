import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { CollectionNotFoundError, deleteCollection, renameCollection } from "@/lib/collections";
import { sanitizeCollectionName } from "@/lib/collections-shared";
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

/** Renomme la liste. Corps : { name }. */
export async function PATCH(req: Request, ctx: Ctx) {
  const g = await guard(req, ctx);
  if (g.refused) return g.refused;
  let name: string | null = null;
  try {
    name = sanitizeCollectionName(((await req.json()) as { name?: unknown }).name);
  } catch {
    /* corps invalide */
  }
  if (!name) return NextResponse.json({ error: "Donnez un nom à la liste." }, { status: 400 });
  try {
    return NextResponse.json({ collection: await renameCollection(g.user.uid, g.id, name) }, { headers: PRIVATE });
  } catch (e) {
    if (e instanceof CollectionNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    return NextResponse.json({ error: "Le renommage a échoué." }, { status: 502 });
  }
}

/** Supprime la liste (les articles restent en favoris). */
export async function DELETE(req: Request, ctx: Ctx) {
  const g = await guard(req, ctx);
  if (g.refused) return g.refused;
  try {
    await deleteCollection(g.user.uid, g.id);
    return NextResponse.json({ ok: true }, { headers: PRIVATE });
  } catch {
    return NextResponse.json({ error: "La suppression a échoué." }, { status: 502 });
  }
}
