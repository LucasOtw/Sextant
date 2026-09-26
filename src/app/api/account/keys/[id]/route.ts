import { NextResponse } from "next/server";
import { PRIVATE, requireUser, serverError } from "@/lib/api/guard";
import { revokeKey } from "@/lib/api-keys";
import { API_KEY_ID } from "@/lib/api-keys-shared";

export const runtime = "nodejs";

/** Révoque une clé : elle cesse de fonctionner immédiatement. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, refused } = await requireUser(req);
  if (refused) return refused;
  const { id } = await ctx.params;
  if (!API_KEY_ID.test(id)) return NextResponse.json({ error: "Clé invalide." }, { status: 400 });
  try {
    if (!(await revokeKey(user.uid, id))) return NextResponse.json({ error: "Clé introuvable." }, { status: 404 });
    return NextResponse.json({ ok: true }, { headers: PRIVATE });
  } catch (e) {
    return serverError("account.keys.id.DELETE", e, "La révocation a échoué.");
  }
}
