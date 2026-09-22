import { NextResponse } from "next/server";
import { getAuthorProfile } from "@/lib/openalex";

/** Profil court d'un auteur (OpenAlex), pour la carte au survol. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id") ?? "";
  const inst = sp.get("inst");
  if (!/^A\d+$/i.test(id)) return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  try {
    const profile = await getAuthorProfile(id, inst && /^I\d+$/i.test(inst) ? inst : null);
    if (!profile) return NextResponse.json({ error: "Auteur introuvable." }, { status: 404 });
    return NextResponse.json(profile, { headers: { "cache-control": "public, max-age=3600" } });
  } catch {
    return NextResponse.json({ error: "Profil indisponible." }, { status: 502 });
  }
}
