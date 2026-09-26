import { NextResponse } from "next/server";
import { PRIVATE, requireUser, serverError } from "@/lib/api/guard";
import { CollectionsLimitError, createCollection, listCollections } from "@/lib/collections";
import { sanitizeCollectionDescription, sanitizeCollectionName } from "@/lib/collections-shared";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { user, refused } = await requireUser(req, { bucket: "collections", read: true });
  if (refused) return refused;
  try {
    return NextResponse.json({ collections: await listCollections(user.uid) }, { headers: PRIVATE });
  } catch (e) {
    return serverError("collections.GET", e, "Listes indisponibles.");
  }
}

/** Crée une liste. Corps : { name, description? }. */
export async function POST(req: Request) {
  const { user, refused } = await requireUser(req, { bucket: "collections", maxBody: 16_384 });
  if (refused) return refused;
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
    return serverError("collections.POST", e, "La création a échoué.");
  }
}
