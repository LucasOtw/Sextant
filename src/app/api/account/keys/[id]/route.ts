import { NextResponse } from "next/server";
import { requireStrictUser } from "@/lib/auth";
import { revokeKey } from "@/lib/api-keys";
import { API_KEY_ID } from "@/lib/api-keys-shared";
import { rejectCrossSite } from "@/lib/security";
import { logError } from "@/lib/log";

export const runtime = "nodejs";

/** Révoque une clé : elle cesse de fonctionner immédiatement. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const refused = rejectCrossSite(req);
  if (refused) return refused;
  const { ok, user, refused: denied } = await requireStrictUser();
  if (!ok) return denied;
  const { id } = await ctx.params;
  if (!API_KEY_ID.test(id)) return NextResponse.json({ error: "Clé invalide." }, { status: 400 });
  try {
    if (!(await revokeKey(user.uid, id))) return NextResponse.json({ error: "Clé introuvable." }, { status: 404 });
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "private, no-store" } });
  } catch (e) {
    logError("account.keys.id.DELETE", e);
    return NextResponse.json({ error: "La révocation a échoué." }, { status: 502 });
  }
}
