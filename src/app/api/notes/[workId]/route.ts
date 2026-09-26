import { NextResponse } from "next/server";
import { PRIVATE, requireUser, serverError } from "@/lib/api/guard";
import { checkSnapshot } from "@/lib/favorites";
import { sanitizeSnapshot } from "@/lib/favorites-shared";
import { WORK_ID } from "@/lib/ids";
import { cleanText } from "@/lib/highlights-shared";
import { getNote, NotesLimitError, setNote } from "@/lib/notes";
import { MAX_ARTICLE_NOTE } from "@/lib/notes-shared";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ workId: string }> };

async function guard(req: Request, ctx: Ctx, write: boolean) {
  // Écriture : échec fermé si Firebase Auth ne répond pas ; lecture : servie quand même (lib/auth.ts).
  const { user, refused } = await requireUser(req, { bucket: "notes", read: !write, maxBody: 32_768 });
  if (refused) return { refused };
  const { workId } = await ctx.params;
  if (!WORK_ID.test(workId)) return { refused: NextResponse.json({ error: "Identifiant invalide." }, { status: 400 }) };
  return { user, workId };
}

export async function GET(req: Request, ctx: Ctx) {
  const g = await guard(req, ctx, false);
  if (g.refused) return g.refused;
  try {
    return NextResponse.json({ note: await getNote(g.user.uid, g.workId) }, { headers: PRIVATE });
  } catch (e) {
    return serverError("notes.workId.GET", e, "Note indisponible.");
  }
}

/** Enregistre la note. Corps : { text, article } ; un texte vide efface la note. */
export async function PUT(req: Request, ctx: Ctx) {
  const g = await guard(req, ctx, true);
  if (g.refused) return g.refused;
  let body: { text?: unknown; article?: unknown };
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as { text?: unknown; article?: unknown };
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  if (typeof body.text !== "string") return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  if (Array.from(body.text).length > MAX_ARTICLE_NOTE) return NextResponse.json({ error: `Note trop longue (${MAX_ARTICLE_NOTE} caractères au plus).` }, { status: 400 });
  const input = sanitizeSnapshot(body.article);
  if (!input || input.id !== g.workId) return NextResponse.json({ error: "Article invalide." }, { status: 400 });
  // Métadonnées rechargées depuis OpenAlex, comme pour les favoris (SEC-06) : elles ressortent dans l'export et get_my_notes.
  const checked = await checkSnapshot(input);
  if (!checked) return NextResponse.json({ error: "Article introuvable." }, { status: 404 });
  try {
    return NextResponse.json({ note: await setNote(g.user.uid, checked.snapshot, cleanText(body.text, MAX_ARTICLE_NOTE, true), checked.verified) }, { headers: PRIVATE });
  } catch (e) {
    if (e instanceof NotesLimitError) return NextResponse.json({ error: e.message }, { status: 409 });
    return serverError("notes.workId.PUT", e, "L'enregistrement a échoué.");
  }
}
