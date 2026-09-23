/** Listes de favoris : une liste = un nom + des identifiants d'articles (tous favoris). Partagé client / serveur. */
export interface Collection {
  id: string;
  name: string;
  articleIds: string[];
  createdAt: string | null;
}

export const MAX_COLLECTIONS = 50;
export const MAX_COLLECTION_NAME = 60;

/** Nom nettoyé (espaces, longueur) ou null s'il est vide. */
export function sanitizeCollectionName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const name = input.replace(/\s+/g, " ").trim().slice(0, MAX_COLLECTION_NAME);
  return name.length ? name : null;
}
