import { NextResponse } from "next/server";
import { getCurrentUser, getCurrentUserStrict } from "@/lib/auth";
import { addFavorite, FavoritesLimitError, listFavoriteIds, removeFavorite, verifiedSnapshot } from "@/lib/favorites";
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
const TOO_MANY = () => NextResponse.json({ error: "Trop de requêtes, réessayez dans une minute." }, { status: 429 });

/**
 * Par défaut : les identifiants seulement (une lecture Firestore), ce qu'il faut pour les cœurs.
 * `?collections=1` : ajoute les listes (une lecture par liste), demandé par les écrans qui les affichent.
 * La réponse porte aussi l'identité (`user`) : c'est par cet appel, déjà fait à chaque chargement de page par un
 * connecté, que l'en-tête apprend qui est connecté, les pages étant mises en cache identiques pour tous (PERF-01).
 * Sans session valide : 401, et l'indice de connexion lisible par le navigateur est effacé.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    const res = NextResponse.json({ error: "Non connecté." }, { status: 401, headers: PRIVATE });
    // Cookie de session présent mais refusé (révoqué, expiré) : marqué `0` une heure, pour que le proxy ne rétablisse
    // pas l'indice à chaque page ; sans cookie de session, l'indice est simplement effacé.
    const cookie = req.headers.get("cookie") ?? "";
    if (readCookie(cookie, SESSION_COOKIE) !== undefined) setSessionHint(res, "rejected");
    else if (readCookie(cookie, SESSION_HINT_COOKIE) !== undefined) setSessionHint(res, "off");
    return res;
  }
  if (tooMany(user.uid)) return TOO_MANY();
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
  const user = await getCurrentUserStrict();
  if (!user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  if (tooMany(user.uid)) return TOO_MANY();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const input = sanitizeSnapshot(body);
  if (!input) return NextResponse.json({ error: "Article invalide." }, { status: 400 });
  // Métadonnées rechargées depuis OpenAlex : celles du client ne servent qu'à valider l'identifiant (SEC-06).
  const snapshot = await verifiedSnapshot(input);
  if (!snapshot) return NextResponse.json({ error: "Article introuvable." }, { status: 404 });
  try {
    return NextResponse.json({ favorite: await addFavorite(user.uid, snapshot) }, { status: 201, headers: PRIVATE });
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
  const user = await getCurrentUserStrict();
  if (!user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
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
