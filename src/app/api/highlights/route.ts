import { NextResponse } from "next/server";
import { PRIVATE, requireUser, serverError } from "@/lib/api/guard";
import { verifiedSnapshot } from "@/lib/favorites";
import { WORK_ID } from "@/lib/ids";
import { createHighlight, HighlightsLimitError, listHighlights } from "@/lib/highlights";
import { MAX_HIGHLIGHT_TEXT, sanitizeHighlightInput, tooLong } from "@/lib/highlights-shared";

export const runtime = "nodejs";

/**
 * Surlignages d'un article (`?work=W…`), relus par la fiche à l'affichage : au retour arrière, Next réutilise la page
 * déjà rendue, dont la liste peut être périmée (note modifiée ou passage supprimé depuis « Mes citations »).
 */
export async function GET(req: Request) {
  const work = new URL(req.url).searchParams.get("work") ?? "";
  if (!WORK_ID.test(work)) return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  const { user, refused } = await requireUser(req, { bucket: "highlights", read: true });
  if (refused) return refused;
  try {
    return NextResponse.json({ highlights: await listHighlights(user.uid, work) }, { headers: PRIVATE });
  } catch (e) {
    return serverError("highlights.GET", e, "Surlignages indisponibles.", { work });
  }
}

/** Enregistre un passage. Corps : { text, page?, note?, source, prefix?, suffix?, article }. */
export async function POST(req: Request) {
  const { user, refused } = await requireUser(req, { bucket: "highlights", maxBody: 32_768 });
  if (refused) return refused;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  if (body && typeof body === "object" && tooLong((body as { text?: unknown }).text, MAX_HIGHLIGHT_TEXT)) {
    return NextResponse.json({ error: `Passage trop long (${MAX_HIGHLIGHT_TEXT} caractères au plus).` }, { status: 400 });
  }
  const input = sanitizeHighlightInput(body);
  if (!input) return NextResponse.json({ error: "Passage ou article invalide." }, { status: 400 });
  // Métadonnées de l'article rechargées depuis OpenAlex, comme pour les favoris (SEC-06) : seul l'identifiant du client compte.
  const article = await verifiedSnapshot(input.article);
  if (!article) return NextResponse.json({ error: "Article introuvable." }, { status: 404 });
  try {
    return NextResponse.json({ highlight: await createHighlight(user.uid, { ...input, article }) }, { status: 201, headers: PRIVATE });
  } catch (e) {
    if (e instanceof HighlightsLimitError) return NextResponse.json({ error: e.message }, { status: 409 });
    return serverError("highlights.POST", e, "L'enregistrement a échoué.");
  }
}
