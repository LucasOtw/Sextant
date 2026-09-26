import type { FavoriteSnapshot } from "@/lib/favorites-shared";

/**
 * Intention d'enregistrer un article pendant la connexion (clic sur un cœur sans compte) : gardée dans l'onglet
 * (sessionStorage), honorée par le fournisseur des favoris dès que la session est ouverte (QUAL-12).
 */
export const PENDING_FAVORITE_KEY = "sextant:pendingFavorite";
/** Au-delà, une intention oubliée n'est plus honorée (ordinateur partagé, onglet laissé ouvert). */
export const PENDING_MAX_AGE_MS = 10 * 60 * 1000;

interface PendingFavorite {
  snapshot: FavoriteSnapshot;
  at: number;
}

export function writePendingFavorite(snapshot: FavoriteSnapshot) {
  try {
    sessionStorage.setItem(PENDING_FAVORITE_KEY, JSON.stringify({ snapshot, at: Date.now() } satisfies PendingFavorite));
  } catch {
    /* stockage indisponible */
  }
}

export function clearPendingFavorite() {
  try {
    sessionStorage.removeItem(PENDING_FAVORITE_KEY);
  } catch {
    /* rien */
  }
}

/**
 * L'article en attente, retiré du stockage à la lecture (honoré une seule fois), ou null : rien en attente, stockage
 * illisible, intention de plus de 10 minutes ou sans identifiant.
 */
export function readPendingFavorite(now = Date.now()): FavoriteSnapshot | null {
  let pending: PendingFavorite | null = null;
  try {
    const raw = sessionStorage.getItem(PENDING_FAVORITE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_FAVORITE_KEY);
    pending = JSON.parse(raw) as PendingFavorite;
  } catch {
    return null;
  }
  if (!pending?.snapshot?.id || now - (pending.at ?? 0) > PENDING_MAX_AGE_MS) return null;
  return pending.snapshot;
}
