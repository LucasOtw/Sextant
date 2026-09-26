import { NextResponse } from "next/server";
import { requireStrictUser, readSessionWithReason } from "@/lib/auth";
import { addFavorite, checkSnapshot, FavoritesLimitError, listFavoriteIds, removeFavorite, storedCheck } from "@/lib/favorites";
import { sanitizeSnapshot, WORK_ID } from "@/lib/favorites-shared";
import { rateLimit } from "@/lib/rate-limit";
import { rejectCrossSite, rejectLargeBody } from "@/lib/security";
import { listCollections } from "@/lib/collections";
import { logError, recover } from "@/lib/log";
import { readCookie, SESSION_COOKIE, SESSION_HINT_COOKIE, setSessionHint, toClientUser } from "@/lib/session-shared";

export const runtime = "nodejs";

const PRIVATE = { "cache-control": "private, no-store" };

/** 90 requêtes par minute et par utilisateur : large pour un humain, bloquant pour une boucle. */
function tooMany(uid: string) {
  return !rateLimit(`favorites:${uid}`, 90, 60_000);
}
const TOO_MANY_MESSAGE = "Trop de requêtes, réessayez dans une minute.";
const TOO_MANY = () => NextResponse.json({ error: TOO_MANY_MESSAGE }, { status: 429 });

/**
 * Par défaut : les identifiants seulement (une lecture Firestore), ce qu'il faut pour les cœurs.
 * `?collections=1` : ajoute les listes (une lecture par liste), demandé par les écrans qui les affichent.
 * La réponse porte aussi l'identité (`user`) : c'est par cet appel, déjà fait à chaque chargement de page par un
 * connecté, que l'en-tête apprend qui est connecté, les pages étant mises en cache identiques pour tous (PERF-01).
 * Sans session valide : 401, et l'indice de connexion lisible par le navigateur est effacé.
 */
export async function GET(req: Request) {
  const { user, failure } = await readSessionWithReason();
  if (!user) {
    // Session illisible pour cause de panne (SDK Admin, réseau, certificats) : 503 sans toucher à l'indice, le client
    // garde l'état « connecté » et réessaie plus tard. Marquer `0` déconnecterait l'en-tête pendant une heure.
    if (failure === "unavailable") return NextResponse.json({ error: "Session momentanément invérifiable." }, { status: 503, headers: PRIVATE });
    const res = NextResponse.json({ error: "Non connecté." }, { status: 401, headers: PRIVATE });
    const cookie = req.headers.get("cookie") ?? "";
    if (readCookie(cookie, SESSION_COOKIE) !== undefined) {
      // Cookie de session vérifié et refusé (révoqué, expiré, compte supprimé ou désactivé) : inutilisable pour de bon,
      // il est effacé avec l'indice. Laissé en place, le proxy reposerait l'indice « 1 » dès la fin d'une marque
      // temporaire, et l'en-tête basculerait de l'avatar à « Se connecter » à chaque fois, jusqu'à son expiration.
      res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
      setSessionHint(res, "off");
    } else if (readCookie(cookie, SESSION_HINT_COOKIE) !== undefined) setSessionHint(res, "off");
    return res;
  }
  // L'identité accompagne aussi le 429 : sans elle, l'en-tête resterait sans menu (ni déconnexion, ni « Mon compte »).
  if (tooMany(user.uid)) return NextResponse.json({ error: TOO_MANY_MESSAGE, user: toClientUser(user) }, { status: 429, headers: PRIVATE });
  const params = new URL(req.url).searchParams;
  try {
    const withCollections = params.get("collections") === "1";
    // Les listes n'empêchent pas les cœurs : leur échec renvoie `null`, le client garde ce qu'il sait.
    const [ids, collections] = await Promise.all([listFavoriteIds(user.uid), withCollections ? listCollections(user.uid).catch(recover("favorites.collections", null)) : undefined]);
    return NextResponse.json({ user: toClientUser(user), ids, count: ids.length, ...(withCollections ? { collections } : {}) }, { headers: PRIVATE });
  } catch (e) {
    logError("favorites.GET", e);
    // L'identité reste servie : l'en-tête montre le compte même quand Firestore ne répond pas.
    return NextResponse.json({ error: "Favoris indisponibles.", user: toClientUser(user) }, { status: 502, headers: PRIVATE });
  }
}

/** Ajoute (ou rafraîchit) un favori. Corps : l'instantané de l'article. */
export async function POST(req: Request) {
  const refused = rejectCrossSite(req) ?? rejectLargeBody(req);
  if (refused) return refused;
  const { ok, user, refused: denied } = await requireStrictUser();
  if (!ok) return denied;
  if (tooMany(user.uid)) return TOO_MANY();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const input = sanitizeSnapshot(body);
  if (!input) return NextResponse.json({ error: "Article invalide." }, { status: 400 });
  try {
    // Métadonnées rechargées depuis OpenAlex : celles du client ne servent qu'à valider l'identifiant (SEC-06).
    // Article disparu d'OpenAlex : l'instantané déjà stocké (favori existant, ou retiré à l'instant, « Annuler »).
    const checked = (await checkSnapshot(input)) ?? (await storedCheck(user.uid, input.id));
    if (!checked) return NextResponse.json({ error: "Article introuvable." }, { status: 404 });
    return NextResponse.json({ favorite: await addFavorite(user.uid, checked.snapshot, checked.verified) }, { status: 201, headers: PRIVATE });
  } catch (e) {
    if (e instanceof FavoritesLimitError) return NextResponse.json({ error: e.message }, { status: 409 });
    logError("favorites.POST", e);
    return NextResponse.json({ error: "L'enregistrement a échoué." }, { status: 502 });
  }
}

/** Retire un favori : `?id=W…`. */
export async function DELETE(req: Request) {
  const refused = rejectCrossSite(req);
  if (refused) return refused;
  const { ok, user, refused: denied } = await requireStrictUser();
  if (!ok) return denied;
  if (tooMany(user.uid)) return TOO_MANY();
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!WORK_ID.test(id)) return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  try {
    await removeFavorite(user.uid, id);
    return NextResponse.json({ ok: true }, { headers: PRIVATE });
  } catch (e) {
    logError("favorites.DELETE", e);
    return NextResponse.json({ error: "La suppression a échoué." }, { status: 502 });
  }
}
