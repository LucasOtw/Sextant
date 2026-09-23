import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { addFavorite, FavoritesLimitError, listFavorites, removeFavorite } from "@/lib/favorites";
import { sanitizeSnapshot } from "@/lib/favorites-shared";
import { rateLimit } from "@/lib/rate-limit";

/** 90 requêtes par minute et par utilisateur : large pour un humain, bloquant pour une boucle. */
function tooMany(uid: string) {
  return !rateLimit(`favorites:${uid}`, 90, 60_000);
}
const TOO_MANY = () => NextResponse.json({ error: "Trop de requêtes, réessayez dans une minute." }, { status: 429 });

export const runtime = "nodejs";

/** Liste des favoris de l'utilisateur connecté. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  if (tooMany(user.uid)) return TOO_MANY();
  try {
    return NextResponse.json({ favorites: await listFavorites(user.uid) }, { headers: { "cache-control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Favoris indisponibles." }, { status: 502 });
  }
}

/** Ajoute (ou rafraîchit) un favori. Corps : l'instantané de l'article. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  if (tooMany(user.uid)) return TOO_MANY();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const snapshot = sanitizeSnapshot(body);
  if (!snapshot) return NextResponse.json({ error: "Article invalide." }, { status: 400 });
  try {
    return NextResponse.json({ favorite: await addFavorite(user.uid, snapshot) }, { status: 201 });
  } catch (e) {
    if (e instanceof FavoritesLimitError) return NextResponse.json({ error: e.message }, { status: 409 });
    return NextResponse.json({ error: "L'enregistrement a échoué." }, { status: 502 });
  }
}

/** Retire un favori : `?id=W…`. */
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  if (tooMany(user.uid)) return TOO_MANY();
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^W\d+$/.test(id)) return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  try {
    await removeFavorite(user.uid, id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "La suppression a échoué." }, { status: 502 });
  }
}
