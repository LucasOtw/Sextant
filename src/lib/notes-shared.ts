import type { FavoriteSnapshot } from "@/lib/favorites-shared";

/** Note personnelle sur un article : un texte libre par article et par utilisateur, avec l'article dénormalisé. */
export interface ArticleNote {
  workId: string;
  text: string;
  article: FavoriteSnapshot;
  updatedAt: string | null;
}

export const MAX_ARTICLE_NOTE = 4000;
