import "server-only";

type Context = Record<string, string | number | boolean | null | undefined>;

/**
 * Journal d'erreur serveur, une ligne JSON par erreur (lue dans les journaux d'exécution Vercel).
 * On n'écrit que la nature de l'erreur : jamais de corps de requête, de jeton, de clé, de cookie ni d'adresse e-mail.
 * Le contexte ne doit porter que des identifiants publics (article W…, route, statut).
 */
export function logError(scope: string, err: unknown, ctx?: Context): void {
  const e = err as { name?: unknown; message?: unknown; code?: unknown; status?: unknown; cause?: unknown } | null;
  const cause = e?.cause as { name?: unknown; code?: unknown } | undefined;
  const entry = {
    // Le contexte d'abord : il ne peut pas écraser les champs fixes (niveau, portée, message).
    ...ctx,
    level: "error",
    scope,
    name: typeof e?.name === "string" ? e.name : typeof err,
    message: scrub(typeof e?.message === "string" ? e.message : String(err)),
    code: typeof e?.code === "string" || typeof e?.code === "number" ? e.code : undefined,
    status: typeof e?.status === "number" ? e.status : undefined,
    // Cause d'un « fetch failed » (ECONNRESET, UND_ERR_CONNECT_TIMEOUT…) : c'est elle qui dit ce qui a lâché.
    cause: cause && (typeof cause.code === "string" ? cause.code : typeof cause.name === "string" ? cause.name : undefined),
  };
  console.error(JSON.stringify(entry));
}

/**
 * Message d'erreur sans donnée personnelle : les erreurs Firestore citent le chemin du document
 * (« …/documents/users/<uid>/apiKeys/… »), d'autres une adresse e-mail. Tronqué à 300 caractères.
 */
function scrub(message: string): string {
  return message
    .slice(0, 1000)
    .replace(/users\/[^/\s"']+/g, "users/<uid>")
    .replace(/[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+/g, "<email>")
    .slice(0, 300);
}

/** Codes Firebase Auth d'une session simplement expirée, révoquée ou mal formée : cas attendus, pas des pannes. */
const EXPECTED_AUTH_CODES = new Set([
  "auth/session-cookie-expired",
  "auth/session-cookie-revoked",
  "auth/argument-error",
  "auth/user-disabled",
  "auth/user-not-found",
  "auth/id-token-expired",
  "auth/id-token-revoked",
  "auth/invalid-id-token",
]);

/**
 * Messages du vérificateur de jetons de firebase-admin (token-verifier.js) pour un jeton mal formé ou mal signé : ils
 * nomment toujours le jeton (« Firebase session cookie has invalid signature », « Decoding Firebase ID token failed »,
 * « verifySessionCookie() expects a session cookie… »). Une panne du téléchargement des clés publiques de Google
 * ressort, elle, avec le même code `auth/argument-error` mais le message brut de l'erreur réseau
 * (« Error fetching public keys… », délai dépassé) : ce n'est pas un refus.
 */
const TOKEN_VERIFIER_MESSAGE = /^(Firebase (session cookie|ID token)\b|Decoding Firebase |First argument to verify(SessionCookie|IdToken)\(\)|verify(SessionCookie|IdToken)\(\) expects )/;

/** Vrai si l'erreur Firebase Auth relève d'un jeton refusé (et non d'une panne du SDK, du réseau ou de la configuration). */
export function isExpectedAuthError(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  const code = e?.code;
  if (typeof code !== "string" || !EXPECTED_AUTH_CODES.has(code)) return false;
  // `auth/argument-error` est aussi le code par défaut de firebase-admin pour une erreur de clés publiques
  // (JwtErrorCode.KEY_FETCH_ERROR, sans cas dédié) : refus seulement si le message vient du vérificateur lui-même.
  if (code === "auth/argument-error") return typeof e?.message === "string" && TOKEN_VERIFIER_MESSAGE.test(e.message);
  return true;
}

/**
 * Gestionnaire de `.catch` qui journalise puis renvoie une valeur de repli :
 * `getTopic(id).catch(recover("search.topic", null))`. Le repli reste affiché, mais la panne laisse une trace.
 */
export function recover<T>(scope: string, fallback: T, ctx?: Context): (err: unknown) => T {
  return (err) => {
    logError(scope, err, ctx);
    return fallback;
  };
}
