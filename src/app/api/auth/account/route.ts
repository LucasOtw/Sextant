import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { getCurrentUser, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

/** Supprime le compte de l'utilisateur connecté : données Firestore puis compte Firebase Auth. */
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  try {
    await adminDb().recursiveDelete(adminDb().doc(`users/${user.uid}`));
    await adminAuth().deleteUser(user.uid);
  } catch {
    return NextResponse.json({ error: "La suppression a échoué, réessayez." }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
