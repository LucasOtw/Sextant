import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { getCurrentUser, isAuthEnabled, SESSION_COOKIE, SESSION_MAX_AGE_MS } from "@/lib/auth";
import { WRONG_ACCOUNT } from "@/lib/reauth-shared";
import { isExpectedAuthError, logError } from "@/lib/log";
import { rejectCrossSite, rejectLargeBody } from "@/lib/security";

export const runtime = "nodejs";

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

/**
 * Échange un jeton Firebase (obtenu côté client après Google) contre un cookie de session HttpOnly.
 * `reauth: true` (ré-authentification avant une opération sensible, SEC-09) : le compte Google choisi doit être
 * celui de la session en cours, sinon refus (403 `wrong_account`). Sans ce contrôle, choisir un autre compte dans la
 * fenêtre Google basculerait la session, et l'opération rejouée (suppression du compte !) viserait cet autre compte.
 */
export async function POST(req: Request) {
  // Un jeton Firebase pèse 1 à 2 Ko : 8 Ko laissent de la marge sans lire un corps démesuré (SEC-17).
  const refused = rejectCrossSite(req) ?? rejectLargeBody(req, 8_192);
  if (refused) return refused;
  if (!isAuthEnabled()) return NextResponse.json({ error: "Comptes désactivés." }, { status: 503 });
  let idToken: string | undefined;
  let reauth = false;
  try {
    const body = (await req.json()) as { idToken?: unknown; reauth?: unknown };
    idToken = typeof body.idToken === "string" ? body.idToken : undefined;
    reauth = body.reauth === true;
  } catch {
    /* corps invalide */
  }
  if (!idToken) return NextResponse.json({ error: "Jeton manquant." }, { status: 400 });

  try {
    const auth = await adminAuth();
    const decoded = await auth.verifyIdToken(idToken, true);
    // Seule la connexion Google ouvre une session (SEC-14) : si un autre fournisseur (anonyme, e-mail) était activé
    // dans le projet Firebase, chaque nouvel uid contournerait les limites par compte (un vote, 5 sujets par heure).
    if (decoded.firebase?.sign_in_provider !== "google.com") {
      return NextResponse.json({ error: "Connexion Google requise." }, { status: 403 });
    }
    // Le jeton doit être récent : on refuse une connexion vieille de plus de 5 minutes.
    if (Date.now() / 1000 - decoded.auth_time > 5 * 60) {
      return NextResponse.json({ error: "Connexion trop ancienne, recommencez." }, { status: 401 });
    }
    if (reauth) {
      const current = await getCurrentUser();
      if (!current) return NextResponse.json({ error: "Session expirée : reconnectez-vous." }, { status: 401 });
      if (current.uid !== decoded.uid) {
        return NextResponse.json({ error: "Ce compte Google n'est pas celui de votre session. Choisissez le même compte.", code: WRONG_ACCOUNT }, { status: 403 });
      }
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

/**
 * Déconnexion de cet appareil : efface le cookie de session, sans révoquer les autres appareils. La révocation de
 * toutes les sessions (et des clés MCP) est une action distincte : DELETE /api/auth/sessions (SEC-08).
 */
export async function DELETE(req: Request) {
  const refused = rejectCrossSite(req);
  if (refused) return refused;
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return res;
}
