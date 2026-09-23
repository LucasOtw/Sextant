/** Listes de favoris : une liste = un nom + des identifiants d'articles (tous favoris). Partagé client / serveur. */
export interface Collection {
  id: string;
  name: string;
  /** Quelques mots sur l'usage de la liste (facultatif). */
  description: string;
  /** Ordre manuel : l'ordre du tableau est celui de la liste. */
  articleIds: string[];
  createdAt: string | null;
}

export const MAX_COLLECTIONS = 50;
export const MAX_COLLECTION_NAME = 60;
export const MAX_COLLECTION_DESCRIPTION = 200;

/** Description nettoyée (vide autorisée). */
export function sanitizeCollectionDescription(input: unknown): string {
  if (typeof input !== "string") return "";
  const cleaned = input.replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim();
  return Array.from(cleaned).slice(0, MAX_COLLECTION_DESCRIPTION).join("").trim();
}

/** Nom nettoyé (caractères de contrôle et invisibles retirés, espaces réduits, longueur bornée par points de code) ou null s'il est vide. */
export function sanitizeCollectionName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const cleaned = input.replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim();
  const name = Array.from(cleaned).slice(0, MAX_COLLECTION_NAME).join("").trim();
  return name.length ? name : null;
}
