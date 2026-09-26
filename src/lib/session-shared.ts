/**
 * Cookies de session, partagés par le serveur (routes, proxy) et le navigateur. Pur, sans import serveur.
 *
 * - `sextant_session` : le cookie de session Firebase, HttpOnly, seul à prouver l'identité.
 * - `sextant_signed_in` : simple indice, lisible par le navigateur, qui suit la session. Il ne
 *   donne aucun droit (toute route vérifie le vrai cookie) ; il permet seulement aux pages mises en cache au bord, donc
 *   identiques pour tous, de savoir sans requête qu'un visiteur est anonyme, et d'afficher la bonne place dans l'en-tête
 *   avant l'hydratation (PERF-01). Valeurs : `1` = session ouverte ; `0` = cookie de session présent mais refusé
 *   (révoqué, expiré), pour une heure : le proxy ne le remet pas à `1` à chaque page, ce qui ferait clignoter l'en-tête
 *   et coûterait une requête par page ; passé ce délai, une nouvelle vérification a lieu. Une panne de la vérification
 *   (SDK Admin, réseau) ne pose pas cette marque : GET /api/favorites répond alors 503 et l'indice reste tel quel.
 */
export const SESSION_COOKIE = "sextant_session";
export const SESSION_HINT_COOKIE = "sextant_signed_in";
/** Durée de la session : 14 jours (maximum autorisé par Firebase). */
export const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
/** Durée de la marque « session refusée » (`0`). */
const REJECTED_MAX_AGE_S = 60 * 60;

export type SessionHint = "on" | "off" | "rejected";

/** Options de l'indice : lisible par le script de la page (pas HttpOnly), même portée que la session. */
export function sessionHintOptions(hint: SessionHint) {
  return {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: hint === "on" ? SESSION_MAX_AGE_MS / 1000 : hint === "rejected" ? REJECTED_MAX_AGE_S : 0,
  };
}

/** Pose, marque refusée ou efface l'indice sur une réponse (NextResponse, ou tout objet exposant `cookies.set`). */
export function setSessionHint(res: { cookies: { set: (name: string, value: string, options: ReturnType<typeof sessionHintOptions>) => unknown } }, hint: SessionHint): void {
  res.cookies.set(SESSION_HINT_COOKIE, hint === "on" ? "1" : hint === "rejected" ? "0" : "", sessionHintOptions(hint));
}

/** Valeur d'un cookie dans une chaîne `document.cookie` ou un en-tête Cookie ; undefined s'il est absent. */
export function readCookie(cookieString: string, name: string): string | undefined {
  for (const part of cookieString.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1);
  }
  return undefined;
}

/** Session ouverte d'après l'indice (`document.cookie`, ou l'en-tête Cookie d'une requête) ? */
export function hasSessionHint(cookieString: string): boolean {
  return readCookie(cookieString, SESSION_HINT_COOKIE) === "1";
}

/**
 * Accord entre l'indice et la présence du cookie de session, pour le proxy (sans vérifier la session, ce que font les
 * routes) : l'indice à poser, ou null s'il n'y a rien à faire. Rattrape les sessions ouvertes avant l'indice (posé
 * s'il manque), et les cookies de session expirés ou effacés sans lui (indice effacé). Une marque `0` est respectée.
 */
export function sessionHintFix(hasSession: boolean, hint: string | undefined): SessionHint | null {
  if (hasSession && hint === undefined) return "on";
  if (!hasSession && hint !== undefined) return "off";
  return null;
}

/** Identité montrée par l'interface (menu du compte) : ce que renvoie GET /api/favorites avec les favoris. */
export interface ClientUser {
  uid: string;
  name: string | null;
  email: string | null;
  picture: string | null;
}

/** Réduit un utilisateur de session aux champs utiles à l'interface (jamais `authTime` ni d'autre claim). */
export function toClientUser(u: ClientUser): ClientUser {
  return { uid: u.uid, name: u.name, email: u.email, picture: u.picture };
}
