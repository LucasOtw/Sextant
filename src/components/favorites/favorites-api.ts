import { api } from "@/lib/client/api";
import type { Collection } from "@/lib/collections-shared";
import type { Favorite, FavoriteSnapshot } from "@/lib/favorites-shared";

/**
 * Appels réseau des favoris et des listes (QUAL-12), sur le client HTTP commun : chaque refus lève une `ApiError`
 * (lib/client/api.ts) que le fournisseur traduit en retour arrière et en message.
 */

export async function postFavorite(snapshot: FavoriteSnapshot): Promise<Favorite> {
  return (await api<{ favorite: Favorite }>("/api/favorites", { method: "POST", json: snapshot, fallback: "L'enregistrement a échoué." })).favorite;
}

export async function deleteFavorite(id: string): Promise<void> {
  await api(`/api/favorites?id=${id}`, { method: "DELETE", fallback: "La suppression a échoué." });
}

/** Range l'article dans la liste (et l'enregistre en favori s'il ne l'était pas) : renvoie le favori enregistré. */
export async function addToList(listId: string, snapshot: FavoriteSnapshot): Promise<Favorite | undefined> {
  return (await api<{ favorite?: Favorite }>(`/api/collections/${listId}/articles`, { method: "POST", json: snapshot })).favorite;
}

export async function removeFromList(listId: string, workId: string): Promise<void> {
  await api(`/api/collections/${listId}/articles?workId=${workId}`, { method: "DELETE" });
}

export async function postCollection(name: string, description: string): Promise<Collection> {
  return (await api<{ collection: Collection }>("/api/collections", { method: "POST", json: { name, description } })).collection;
}

export async function patchCollection(id: string, patch: { name?: string; description?: string; articleIds?: string[] }): Promise<void> {
  await api(`/api/collections/${id}`, { method: "PATCH", json: patch });
}

export async function deleteCollection(id: string): Promise<void> {
  await api(`/api/collections/${id}`, { method: "DELETE" });
}

/** Active le lien de partage : renvoie son jeton. */
export async function shareCollection(id: string): Promise<string> {
  return String((await api<{ shareToken?: string }>(`/api/collections/${id}/share`, { method: "POST" })).shareToken);
}

export async function unshareCollection(id: string): Promise<void> {
  await api(`/api/collections/${id}/share`, { method: "DELETE" });
}
