import { NextResponse } from "next/server";
import { getCurrentUserStrict } from "@/lib/auth";
import { addToCollection, CollectionNotFoundError, CollectionsLimitError, removeFromCollection } from "@/lib/collections";
import { FavoritesLimitError, verifiedSnapshot } from "@/lib/favorites";
import { sanitizeSnapshot, WORK_ID } from "@/lib/favorites-shared";
import { rateLimit } from "@/lib/rate-limit";
import { rejectCrossSite, rejectLargeBody } from "@/lib/security";
import { logError } from "@/lib/log";

export const runtime = "nodejs";
const PRIVATE = { "cache-control": "private, no-store" };
const ID = /^[A-Za-z0-9_-]{1,64}$/;

type Ctx = { params: Promise<{ id: string }> };

/** Seau distinct de la gestion des listes : ranger des articles en série est un usage normal (90 par minute). */
async function guard(req: Request, ctx: Ctx) {
  const refused = rejectCrossSite(req) ?? rejectLargeBody(req);
  if (refused) return { refused };
  const user = await getCurrentUserStrict();
  if (!user) return { refused: NextResponse.json({ error: "Non connecté." }, { status: 401 }) };
  if (!rateLimit(`collections-items:${user.uid}`, 90, 60_000)) return { refused: NextResponse.json({ error: "Trop de requêtes, réessayez dans une minute." }, { status: 429 }) };
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
  // Métadonnées rechargées depuis OpenAlex : celles du client ne servent qu'à valider l'identifiant (SEC-06).
  const snapshot = await verifiedSnapshot(input);
  if (!snapshot) return NextResponse.json({ error: "Article introuvable." }, { status: 404 });
  try {
    return NextResponse.json(await addToCollection(g.user.uid, g.id, snapshot), { status: 201, headers: PRIVATE });
  } catch (e) {
    if (e instanceof CollectionNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof CollectionsLimitError || e instanceof FavoritesLimitError) return NextResponse.json({ error: e.message }, { status: 409 });
    logError("collections.id.articles.POST", e);
    return NextResponse.json({ error: "L'ajout a échoué." }, { status: 502 });
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
    logError("collections.id.articles.DELETE", e);
    return NextResponse.json({ error: "Le retrait a échoué." }, { status: 502 });
  }
}
