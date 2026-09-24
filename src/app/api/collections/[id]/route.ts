import { NextResponse } from "next/server";
import { getCurrentUserStrict } from "@/lib/auth";
import { type CollectionPatch, CollectionNotFoundError, CollectionOrderError, deleteCollection, updateCollection } from "@/lib/collections";
import { MAX_FAVORITES, WORK_ID } from "@/lib/favorites-shared";
import { sanitizeCollectionDescription, sanitizeCollectionName } from "@/lib/collections-shared";
import { rateLimit } from "@/lib/rate-limit";
import { rejectCrossSite, rejectLargeBody } from "@/lib/security";
import { logError } from "@/lib/log";

export const runtime = "nodejs";
const PRIVATE = { "cache-control": "private, no-store" };
const ID = /^[A-Za-z0-9_-]{1,64}$/;

type Ctx = { params: Promise<{ id: string }> };

/** Même seau que /api/collections : la gestion des listes est plafonnée à 60 par minute. */
async function guard(req: Request, ctx: Ctx) {
  const refused = rejectCrossSite(req) ?? rejectLargeBody(req);
  if (refused) return { refused };
  const user = await getCurrentUserStrict();
  if (!user) return { refused: NextResponse.json({ error: "Non connecté." }, { status: 401 }) };
  if (!rateLimit(`collections:${user.uid}`, 60, 60_000)) return { refused: NextResponse.json({ error: "Trop de requêtes, réessayez dans une minute." }, { status: 429 }) };
  const { id } = await ctx.params;
  if (!ID.test(id)) return { refused: NextResponse.json({ error: "Liste invalide." }, { status: 400 }) };
  return { user, id };
}

/** Modifie la liste. Corps : { name?, description?, articleIds? } (au moins un champ ; articleIds = nouvel ordre complet). */
export async function PATCH(req: Request, ctx: Ctx) {
  const g = await guard(req, ctx);
  if (g.refused) return g.refused;
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const patch: CollectionPatch = {};
  if (body.name !== undefined) {
    const name = sanitizeCollectionName(body.name);
    if (!name) return NextResponse.json({ error: "Donnez un nom à la liste." }, { status: 400 });
    patch.name = name;
  }
  if (body.description !== undefined) patch.description = sanitizeCollectionDescription(body.description);
  if (body.articleIds !== undefined) {
    const ids = body.articleIds;
    if (!Array.isArray(ids) || ids.length > MAX_FAVORITES || !ids.every((x) => typeof x === "string" && WORK_ID.test(x))) {
      return NextResponse.json({ error: "Ordre invalide." }, { status: 400 });
    }
    patch.articleIds = ids as string[];
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Rien à modifier." }, { status: 400 });
  try {
    return NextResponse.json({ collection: await updateCollection(g.user.uid, g.id, patch) }, { headers: PRIVATE });
  } catch (e) {
    if (e instanceof CollectionNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof CollectionOrderError) return NextResponse.json({ error: e.message }, { status: 409 });
    logError("collections.id.PATCH", e);
    return NextResponse.json({ error: "La modification a échoué." }, { status: 502 });
  }
}

/** Supprime la liste (les articles restent en favoris). */
export async function DELETE(req: Request, ctx: Ctx) {
  const g = await guard(req, ctx);
  if (g.refused) return g.refused;
  try {
    await deleteCollection(g.user.uid, g.id);
    return NextResponse.json({ ok: true }, { headers: PRIVATE });
  } catch (e) {
    logError("collections.id.DELETE", e);
    return NextResponse.json({ error: "La suppression a échoué." }, { status: 502 });
  }
}
