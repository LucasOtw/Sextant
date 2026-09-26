import { NextResponse } from "next/server";
import { PRIVATE, requireUser, serverError } from "@/lib/api/guard";
import { addToCollection, CollectionNotFoundError, CollectionsLimitError, removeFromCollection } from "@/lib/collections";
import { checkSnapshot, FavoritesLimitError, storedCheck } from "@/lib/favorites";
import { sanitizeSnapshot, WORK_ID } from "@/lib/favorites-shared";

export const runtime = "nodejs";
const ID = /^[A-Za-z0-9_-]{1,64}$/;

type Ctx = { params: Promise<{ id: string }> };

/** Seau distinct de la gestion des listes : ranger des articles en série est un usage normal (90 par minute). */
async function guard(req: Request, ctx: Ctx) {
  const { user, refused } = await requireUser(req, { bucket: "collections-items", maxBody: 16_384 });
  if (refused) return { refused };
  const { id } = await ctx.params;
  if (!ID.test(id)) return { refused: NextResponse.json({ error: "Liste invalide." }, { status: 400 }) };
  return { user, id };
}

/** Ajoute un article à la liste (et aux favoris si besoin). Corps : l'instantané de l'article. */
export async function POST(req: Request, ctx: Ctx) {
  const g = await guard(req, ctx);
  if (g.refused) return g.refused;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const input = sanitizeSnapshot(body);
  if (!input) return NextResponse.json({ error: "Article invalide." }, { status: 400 });
  try {
    // Métadonnées rechargées depuis OpenAlex : celles du client ne servent qu'à valider l'identifiant (SEC-06).
    // Article disparu d'OpenAlex mais déjà en favori : son instantané stocké, sans réécriture.
    const checked = (await checkSnapshot(input)) ?? (await storedCheck(g.user.uid, input.id));
    if (!checked) return NextResponse.json({ error: "Article introuvable." }, { status: 404 });
    return NextResponse.json(await addToCollection(g.user.uid, g.id, checked.snapshot, checked.verified), { status: 201, headers: PRIVATE });
  } catch (e) {
    if (e instanceof CollectionNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof CollectionsLimitError || e instanceof FavoritesLimitError) return NextResponse.json({ error: e.message }, { status: 409 });
    return serverError("collections.id.articles.POST", e, "L'ajout a échoué.");
  }
}

/** Retire un article de la liste : `?workId=W…` (il reste en favoris). */
export async function DELETE(req: Request, ctx: Ctx) {
  const g = await guard(req, ctx);
  if (g.refused) return g.refused;
  const workId = new URL(req.url).searchParams.get("workId") ?? "";
  if (!WORK_ID.test(workId)) return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  try {
    return NextResponse.json({ collection: await removeFromCollection(g.user.uid, g.id, workId) }, { headers: PRIVATE });
  } catch (e) {
    if (e instanceof CollectionNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    return serverError("collections.id.articles.DELETE", e, "Le retrait a échoué.");
  }
}
