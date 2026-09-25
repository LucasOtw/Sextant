import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { isAuthEnabled, SESSION_COOKIE, SESSION_MAX_AGE_MS } from "@/lib/auth";
import { isExpectedAuthError, logError } from "@/lib/log";
import { rejectCrossSite } from "@/lib/security";

export const runtime = "nodejs";

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

/** Échange un jeton Firebase (obtenu côté client après Google) contre un cookie de session HttpOnly. */
export async function POST(req: Request) {
  const refused = rejectCrossSite(req);
  if (refused) return refused;
  if (!isAuthEnabled()) return NextResponse.json({ error: "Comptes désactivés." }, { status: 503 });
  let idToken: string | undefined;
  try {
    ({ idToken } = (await req.json()) as { idToken?: string });
  } catch {
    /* corps invalide */
  }
  if (!idToken) return NextResponse.json({ error: "Jeton manquant." }, { status: 400 });

  try {
    const auth = await adminAuth();
    const decoded = await auth.verifyIdToken(idToken, true);
    // Le jeton doit être récent : on refuse une connexion vieille de plus de 5 minutes.
    if (Date.now() / 1000 - decoded.auth_time > 5 * 60) {
      return NextResponse.json({ error: "Connexion trop ancienne, recommencez." }, { status: 401 });
    }
    const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_MS });
    const db = await adminDb();
    const { FieldValue, Timestamp } = await import("firebase-admin/firestore");
    // Date d'inscription : celle de Firebase Auth, identique à chaque connexion. La réécrire ne change donc rien, et
    // un profil créé avant ce correctif retrouve sa vraie date à la connexion suivante.
    const creationTime = await auth
      .getUser(decoded.uid)
      .then((u) => u.metadata.creationTime)
      .catch((e) => {
        logError("session.getUser", e);
        return undefined;
      });
    const createdAt = creationTime ? new Date(creationTime) : null;

    // Profil minimal, créé ou rafraîchi à chaque connexion (une seule écriture).
    await db
      .doc(`users/${decoded.uid}`)
      .set(
        {
          email: decoded.email ?? null,
          name: decoded.name ?? null,
          picture: decoded.picture ?? null,
          lastLoginAt: FieldValue.serverTimestamp(),
          ...(createdAt && !Number.isNaN(createdAt.getTime()) ? { createdAt: Timestamp.fromDate(createdAt) } : {}),
        },
        { merge: true },
      )
      // Profil non écrit : la connexion reste valable (le cookie suffit), mais la panne doit se voir.
      .catch((e) => logError("session.profile", e));

    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, sessionCookie, { ...cookieOptions, maxAge: SESSION_MAX_AGE_MS / 1000 });
    return res;
  } catch (e) {
    // Jeton refusé par Firebase : 401. Tout le reste (SDK Admin, réseau, Firestore) est une panne : 503, journalisée.
    if (isExpectedAuthError(e)) return NextResponse.json({ error: "Jeton invalide." }, { status: 401 });
    logError("session.create", e);
    return NextResponse.json({ error: "Connexion momentanément impossible, réessayez." }, { status: 503 });
  }
}

/** Déconnexion : efface le cookie de session. */
export async function DELETE(req: Request) {
  const refused = rejectCrossSite(req);
  if (refused) return refused;
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return res;
}
