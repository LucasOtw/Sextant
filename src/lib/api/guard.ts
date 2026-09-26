import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser, requireStrictUser, type SessionUser } from "@/lib/auth";
import { logError, type LogContext } from "@/lib/log";
import { rateLimit } from "@/lib/rate-limit";
import { rejectCrossSite, rejectLargeBody } from "@/lib/security";

/**
 * Garde-fous communs des routes API et des pages qui lisent Firestore (QUAL-05) : en-tête privé, limites de débit, réponses 429 et 502, et la séquence
 * « même site → taille du corps → session → limite » des routes d'un utilisateur connecté. Une limite ou un message se
 * change ici, une fois, au lieu d'une quinzaine de routes.
 */

/** Réponse propre à un utilisateur : jamais mise en cache, ni par le navigateur ni par un intermédiaire. */
export const PRIVATE = { "cache-control": "private, no-store" } as const;

export const TOO_MANY_MESSAGE = "Trop de requêtes, réessayez dans une minute.";

const MINUTE = 60_000;

/**
 * Limites de débit, par instance serveur (lib/rate-limit.ts) : `limit` requêtes par fenêtre de `windowMs`. La clé du
 * compteur est `<seau>:<uid>` pour les routes d'un compte, `<seau>:<ip>` pour les routes publiques.
 */
export const RATE_LIMITS = {
  // Par compte.
  /** Gestion des listes (créer, renommer, supprimer, lister, partager). */
  collections: { limit: 60, windowMs: MINUTE },
  /** Ranger des articles en série est un usage normal : seau distinct de la gestion des listes. */
  "collections-items": { limit: 90, windowMs: MINUTE },
  /** Large pour un humain, bloquant pour une boucle. */
  favorites: { limit: 90, windowMs: MINUTE },
  highlights: { limit: 90, windowMs: MINUTE },
  notes: { limit: 90, windowMs: MINUTE },
  keys: { limit: 10, windowMs: MINUTE },
  export: { limit: 5, windowMs: MINUTE },
  "feedback-post": { limit: 5, windowMs: 60 * MINUTE },
  "feedback-vote": { limit: 60, windowMs: MINUTE },
  "account-del": { limit: 3, windowMs: MINUTE },
  "sessions-revoke": { limit: 3, windowMs: MINUTE },
  /** Par compte : les cinq clés possibles d'un compte partagent le même compteur. */
  mcp: { limit: 90, windowMs: MINUTE },
  // Par adresse IP.
  /** Avant toute lecture Firestore : chaque clé bien formée, même fausse, coûte une lecture. */
  "mcp-ip": { limit: 300, windowMs: MINUTE },
  "summary-read": { limit: 60, windowMs: MINUTE },
  /** Génération d'un condensé : appel payant ou sous quota. */
  summary: { limit: 10, windowMs: MINUTE },
  pdf: { limit: 30, windowMs: MINUTE },
  pdfr: { limit: 300, windowMs: MINUTE },
  "pdf-head": { limit: 60, windowMs: MINUTE },
  reco: { limit: 30, windowMs: MINUTE },
  suggest: { limit: 120, windowMs: MINUTE },
  author: { limit: 120, windowMs: MINUTE },
  csp: { limit: 20, windowMs: MINUTE },
  // Pages rendues côté serveur.
  /** Favoris et citations : jusqu'à un millier de lectures par rendu pour une bibliothèque pleine (par compte). */
  "page-lib": { limit: 30, windowMs: MINUTE },
  /** Pages publiques, par IP : assez large pour une classe derrière le NAT d'un campus. */
  "feedback-view": { limit: 120, windowMs: MINUTE },
  "share-view": { limit: 120, windowMs: MINUTE },
} as const;

export type RateBucket = keyof typeof RATE_LIMITS;

/** Vrai quand la limite du seau est dépassée pour cette clé (uid ou IP) ; compte la requête sinon. */
export function overLimit(bucket: RateBucket, key: string): boolean {
  const { limit, windowMs } = RATE_LIMITS[bucket];
  return !rateLimit(`${bucket}:${key}`, limit, windowMs);
}

/** Réponse 429, message commun par défaut. */
export function tooMany(message: string = TOO_MANY_MESSAGE, headers?: HeadersInit): NextResponse {
  return NextResponse.json({ error: message }, { status: 429, headers });
}

/** Panne d'un service (Firestore, Firebase Auth) : journalisée, puis 502 avec un message pour l'utilisateur. */
export function serverError(scope: string, e: unknown, message: string, context?: LogContext): NextResponse {
  logError(scope, e, context);
  return NextResponse.json({ error: message }, { status: 502 });
}

export interface GuardOptions {
  /** Seau de limite de débit, compté par compte ; sans seau, pas de limite. */
  bucket?: Extract<RateBucket, "collections" | "collections-items" | "favorites" | "highlights" | "notes" | "keys" | "export" | "feedback-post" | "feedback-vote" | "account-del">;
  /**
   * Lecture : session lue sans échec fermé (`getCurrentUser`, servie même si Firebase Auth ne répond pas), sans contrôle
   * d'origine ni de taille. Par défaut, écriture : session stricte (`requireStrictUser`) et requête du même site.
   */
  read?: boolean;
  /** Écriture : ne pas exiger une requête du même site (GET strict, comme l'export du compte). */
  crossSiteAllowed?: boolean;
  /** Écriture : taille maximale du corps annoncé, en octets. Sans elle, le corps n'est pas contrôlé (requête sans corps). */
  maxBody?: number;
  /** Message du 401 d'une écriture sans session. */
  signInMessage?: string;
  /** Message du 429. */
  tooManyMessage?: string;
}

export type Guarded = { user: SessionUser; refused: null } | { user: null; refused: NextResponse };

/**
 * Utilisateur connecté d'une route API, ou la réponse de refus : 403 (autre site), 413 (corps trop gros), 401 ou 503
 * (session absente ou invérifiable, lib/auth.ts), 429 (limite du seau). Toujours dans cet ordre.
 */
export async function requireUser(req: Request, options: GuardOptions = {}): Promise<Guarded> {
  let user: SessionUser | null;
  if (options.read) {
    user = await getCurrentUser();
    if (!user) return { user: null, refused: NextResponse.json({ error: "Non connecté." }, { status: 401 }) };
  } else {
    const refused = (options.crossSiteAllowed ? null : rejectCrossSite(req)) ?? (options.maxBody !== undefined ? rejectLargeBody(req, options.maxBody) : null);
    if (refused) return { user: null, refused };
    const session = await requireStrictUser(options.signInMessage);
    if (!session.ok) return { user: null, refused: session.refused };
    user = session.user;
  }
  if (options.bucket && overLimit(options.bucket, user.uid)) return { user: null, refused: tooMany(options.tooManyMessage) };
  return { user, refused: null };
}
