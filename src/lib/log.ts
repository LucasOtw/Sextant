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
    level: "error",
    scope,
    name: typeof e?.name === "string" ? e.name : typeof err,
    message: typeof e?.message === "string" ? e.message.slice(0, 300) : String(err).slice(0, 300),
    code: typeof e?.code === "string" || typeof e?.code === "number" ? e.code : undefined,
    status: typeof e?.status === "number" ? e.status : undefined,
    // Cause d'un « fetch failed » (ECONNRESET, UND_ERR_CONNECT_TIMEOUT…) : c'est elle qui dit ce qui a lâché.
    cause: cause && (typeof cause.code === "string" ? cause.code : typeof cause.name === "string" ? cause.name : undefined),
    ...ctx,
  };
  console.error(JSON.stringify(entry));
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

/** Vrai si l'erreur Firebase Auth relève d'un jeton refusé (et non d'une panne du SDK, du réseau ou de la configuration). */
export function isExpectedAuthError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && EXPECTED_AUTH_CODES.has(code);
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
