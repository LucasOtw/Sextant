import type { FavoriteSnapshot } from "@/lib/favorites-shared";
import { readStored, removeStored, writeStored } from "@/lib/client/storage";

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
  writeStored(PENDING_FAVORITE_KEY, JSON.stringify({ snapshot, at: Date.now() } satisfies PendingFavorite), "session");
}

export function clearPendingFavorite() {
  removeStored(PENDING_FAVORITE_KEY, "session");
}

/**
 * L'article en attente, retiré du stockage à la lecture (honoré une seule fois), ou null : rien en attente, stockage
 * illisible, intention de plus de 10 minutes ou sans identifiant.
 */
export function readPendingFavorite(now = Date.now()): FavoriteSnapshot | null {
  const raw = readStored(PENDING_FAVORITE_KEY, "session");
  if (!raw) return null;
  removeStored(PENDING_FAVORITE_KEY, "session");
  let pending: PendingFavorite | null;
  try {
    pending = JSON.parse(raw) as PendingFavorite;
  } catch {
    return null;
  }
  if (!pending?.snapshot?.id || now - (pending.at ?? 0) > PENDING_MAX_AGE_MS) return null;
  return pending.snapshot;
}
