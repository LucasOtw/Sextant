import { NextResponse } from "next/server";
import { PRIVATE, requireUser, serverError } from "@/lib/api/guard";
import { checkSnapshot, FavoritesLimitError, restoreFavorite, storedCheck } from "@/lib/favorites";
import { sanitizePlacement, sanitizeSnapshot } from "@/lib/favorites-shared";

export const runtime = "nodejs";

/**
 * « Annuler » après le retrait d'un favori (NEW-8), en une requête : le favori revient avec sa date d'ajout et à son
 * rang dans chacune de ses listes, au lieu d'un nouvel ajout (date du jour) suivi d'un ajout par liste (en dernier).
 * Corps : `{ snapshot, placement }`, `placement` étant la place renvoyée par DELETE /api/favorites.
 */
export async function POST(req: Request) {
  const { user, refused } = await requireUser(req, { bucket: "favorites", maxBody: 16_384 });
  if (refused) return refused;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const input = sanitizeSnapshot(o.snapshot);
  if (!input) return NextResponse.json({ error: "Article invalide." }, { status: 400 });
  const placement = sanitizePlacement(o.placement);
  if (!placement) return NextResponse.json({ error: "Place invalide." }, { status: 400 });
  try {
    // Comme un ajout : métadonnées rechargées depuis OpenAlex (SEC-06), ou l'instantané du favori retiré à l'instant.
    const checked = (await checkSnapshot(input)) ?? (await storedCheck(user.uid, input.id));
    if (!checked) return NextResponse.json({ error: "Article introuvable." }, { status: 404 });
    return NextResponse.json(await restoreFavorite(user.uid, checked.snapshot, checked.verified, placement), { status: 201, headers: PRIVATE });
  } catch (e) {
    if (e instanceof FavoritesLimitError) return NextResponse.json({ error: e.message }, { status: 409 });
    return serverError("favorites.restore.POST", e, "Le favori n'a pas pu être rétabli.");
  }
}
