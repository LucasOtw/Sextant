/**
 * Client HTTP des routes /api du site, côté navigateur (QUAL-10) : un seul endroit pour monter un corps JSON, lire une
 * réponse (même vide ou en HTML) et transformer un refus en erreur typée. Le format d'erreur des routes est toujours
 * `{ error: string }`. Les lectures qui inspectent elles-mêmes le statut (chargement des favoris, relectures, HEAD du
 * PDF, recherches avec `signal`) et les appels qui passent par la ré-authentification gardent `fetch`.
 */

/** Refus d'une route : statut HTTP et message pour l'utilisateur (celui du serveur, ou le repli de l'appelant). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiInit {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Corps envoyé en JSON (`content-type` posé). */
  json?: unknown;
  signal?: AbortSignal;
  cache?: RequestCache;
  /** Message quand la réponse d'erreur n'en porte pas (panne de l'hébergeur, corps vide). */
  fallback?: string;
}

/**
 * Appelle une route et renvoie son corps JSON (`{}` s'il est vide ou illisible). Lève `ApiError` si le statut n'est pas
 * 2xx ; une coupure réseau lève l'erreur native de `fetch` (voir `errorMessage`).
 */
export async function api<T = Record<string, unknown>>(path: string, init: ApiInit = {}): Promise<T> {
  const { json, fallback = "Échec.", ...rest } = init;
  const res = await fetch(path, json === undefined ? rest : { ...rest, headers: { "content-type": "application/json" }, body: JSON.stringify(json) });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, typeof data.error === "string" ? data.error : fallback);
  return data as T;
}

/** La session a expiré ou a été révoquée : l'appelant propose de se reconnecter. */
export function needsSignIn(e: unknown): boolean {
  return e instanceof ApiError && e.status === 401;
}

/** Message à montrer : celui de la route, sinon le repli (jamais le message technique d'une coupure réseau). */
export function errorMessage(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.message : fallback;
}
