/** Listes de favoris : une liste = un nom + des identifiants d'articles (tous favoris). Partagé client / serveur. */
export interface Collection {
  id: string;
  name: string;
  /** Quelques mots sur l'usage de la liste (facultatif). */
  description: string;
  /** Ordre manuel : l'ordre du tableau est celui de la liste. */
  articleIds: string[];
  createdAt: string | null;
  /** Jeton du lien de partage en lecture seule, ou null si la liste n'est pas partagée. */
  shareToken: string | null;
}

/**
 * Mêmes listes, dans le même ordre, avec les mêmes noms, descriptions, liens de partage et articles (dans le même
 * ordre) : un rechargement sans changement garde l'état en place et ne re-rend rien (PERF-12).
 */
export function sameCollections(a: readonly Collection[], b: readonly Collection[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((c, i) => {
    const d = b[i];
    return (
      c.id === d.id &&
      c.name === d.name &&
      c.description === d.description &&
      c.shareToken === d.shareToken &&
      c.createdAt === d.createdAt &&
      c.articleIds.length === d.articleIds.length &&
      c.articleIds.every((id, j) => id === d.articleIds[j])
    );
  });
}

/** Jeton de partage : 22 caractères base64url (128 bits aléatoires). */
export const SHARE_TOKEN = /^[A-Za-z0-9_-]{22}$/;

export function shareUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/liste/${token}`;
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
