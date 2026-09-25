import type { FavoriteSnapshot } from "@/lib/favorites-shared";

/** Note personnelle sur un article : un texte libre par article et par utilisateur, avec l'article dénormalisé. */
export interface ArticleNote {
  workId: string;
  text: string;
  article: FavoriteSnapshot;
  updatedAt: string | null;
}

export const MAX_ARTICLE_NOTE = 4000;
/** Notes au plus par compte, comme les 2 000 surlignages (SEC-19) : une note existante reste modifiable au plafond. */
export const MAX_NOTES = 2000;
