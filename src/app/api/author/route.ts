import { NextResponse } from "next/server";
import { getAuthorProfile } from "@/lib/openalex";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { logError } from "@/lib/log";

/** Profil court d'un auteur (OpenAlex), pour la carte au survol. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id") ?? "";
  const inst = sp.get("inst");
  if (!/^A\d+$/i.test(id)) return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  if (!rateLimit(`author:${clientIp(req)}`, 120, 60_000)) return NextResponse.json({ error: "Trop de requêtes, réessayez dans une minute." }, { status: 429 });
  try {
    const profile = await getAuthorProfile(id, inst && /^I\d+$/i.test(inst) ? inst : null);
    if (!profile) return NextResponse.json({ error: "Auteur introuvable." }, { status: 404 });
    return NextResponse.json(profile, { headers: { "cache-control": "public, max-age=3600" } });
  } catch (e) {
    logError("author.GET", e);
    return NextResponse.json({ error: "Profil indisponible." }, { status: 502 });
  }
}
