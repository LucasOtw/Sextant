import { NextResponse } from "next/server";
import { getCurrentUser, getCurrentUserStrict, strictRefusal } from "@/lib/auth";
import { CollectionsLimitError, createCollection, listCollections } from "@/lib/collections";
import { sanitizeCollectionDescription, sanitizeCollectionName } from "@/lib/collections-shared";
import { rateLimit } from "@/lib/rate-limit";
import { rejectCrossSite, rejectLargeBody } from "@/lib/security";
import { logError } from "@/lib/log";

export const runtime = "nodejs";
const PRIVATE = { "cache-control": "private, no-store" };
/** Gestion des listes (créer, renommer, supprimer, lister) : 60 par minute et par utilisateur. */
const tooMany = (uid: string) => !rateLimit(`collections:${uid}`, 60, 60_000);
const TOO_MANY = () => NextResponse.json({ error: "Trop de requêtes, réessayez dans une minute." }, { status: 429 });

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  if (tooMany(user.uid)) return TOO_MANY();
  try {
    return NextResponse.json({ collections: await listCollections(user.uid) }, { headers: PRIVATE });
  } catch (e) {
    logError("collections.GET", e);
    return NextResponse.json({ error: "Listes indisponibles." }, { status: 502 });
  }
}

/** Crée une liste. Corps : { name, description? }. */
export async function POST(req: Request) {
  const refused = rejectCrossSite(req) ?? rejectLargeBody(req);
  if (refused) return refused;
  const user = await getCurrentUserStrict();
  if (!user) return strictRefusal();
  if (tooMany(user.uid)) return TOO_MANY();
  let name: string | null = null;
  let description = "";
  try {
    const body = (await req.json()) as { name?: unknown; description?: unknown };
    name = sanitizeCollectionName(body.name);
    description = sanitizeCollectionDescription(body.description);
  } catch {
    /* corps invalide */
  }
  if (!name) return NextResponse.json({ error: "Donnez un nom à la liste." }, { status: 400 });
  try {
    return NextResponse.json({ collection: await createCollection(user.uid, name, description) }, { status: 201, headers: PRIVATE });
  } catch (e) {
    if (e instanceof CollectionsLimitError) return NextResponse.json({ error: e.message }, { status: 409 });
    logError("collections.POST", e);
    return NextResponse.json({ error: "La création a échoué." }, { status: 502 });
  }
}
