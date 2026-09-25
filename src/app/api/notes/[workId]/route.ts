import { NextResponse } from "next/server";
import { getCurrentUser, getCurrentUserStrict } from "@/lib/auth";
import { sanitizeSnapshot, WORK_ID } from "@/lib/favorites-shared";
import { cleanText } from "@/lib/highlights-shared";
import { getNote, NotesLimitError, setNote } from "@/lib/notes";
import { MAX_ARTICLE_NOTE } from "@/lib/notes-shared";
import { rateLimit } from "@/lib/rate-limit";
import { rejectCrossSite, rejectLargeBody } from "@/lib/security";
import { logError } from "@/lib/log";

export const runtime = "nodejs";
const PRIVATE = { "cache-control": "private, no-store" };

type Ctx = { params: Promise<{ workId: string }> };

async function guard(req: Request, ctx: Ctx, write: boolean) {
  if (write) {
    const refused = rejectCrossSite(req) ?? rejectLargeBody(req, 32_768);
    if (refused) return { refused };
  }
  // Écriture : échec fermé si Firebase Auth ne répond pas ; lecture : servie quand même (lib/auth.ts).
  const user = await (write ? getCurrentUserStrict() : getCurrentUser());
  if (!user) return { refused: NextResponse.json({ error: "Non connecté." }, { status: 401 }) };
  if (!rateLimit(`notes:${user.uid}`, 90, 60_000)) return { refused: NextResponse.json({ error: "Trop de requêtes, réessayez dans une minute." }, { status: 429 }) };
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
    logError("notes.workId.GET", e);
    return NextResponse.json({ error: "Note indisponible." }, { status: 502 });
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
  const article = sanitizeSnapshot(body.article);
  if (!article || article.id !== g.workId) return NextResponse.json({ error: "Article invalide." }, { status: 400 });
  try {
    return NextResponse.json({ note: await setNote(g.user.uid, article, cleanText(body.text, MAX_ARTICLE_NOTE, true)) }, { headers: PRIVATE });
  } catch (e) {
    if (e instanceof NotesLimitError) return NextResponse.json({ error: e.message }, { status: 409 });
    logError("notes.workId.PUT", e);
    return NextResponse.json({ error: "L'enregistrement a échoué." }, { status: 502 });
  }
}
