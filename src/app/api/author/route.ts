import { NextResponse } from "next/server";
import { AUTHOR_ID, INSTITUTION_ID, normalizeId } from "@/lib/ids";
import { getAuthorProfile } from "@/lib/openalex";
import { overLimit } from "@/lib/api/guard";
import { clientIp } from "@/lib/rate-limit";
import { logError } from "@/lib/log";

/** Profil court d'un auteur (OpenAlex), pour la carte au survol. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const id = normalizeId(sp.get("id"), AUTHOR_ID);
  const inst = normalizeId(sp.get("inst"), INSTITUTION_ID);
  if (!id) return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  if (overLimit("author", clientIp(req))) return NextResponse.json({ error: "Trop de requêtes, réessayez dans une minute." }, { status: 429 });
  try {
    const profile = await getAuthorProfile(id, inst);
    if (!profile) return NextResponse.json({ error: "Auteur introuvable." }, { status: 404 });
    return NextResponse.json(profile, { headers: { "cache-control": "public, max-age=3600" } });
  } catch (e) {
    logError("author.GET", e);
    return NextResponse.json({ error: "Profil indisponible." }, { status: 502 });
  }
}
