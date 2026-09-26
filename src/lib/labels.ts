import { truncateWords } from "@/lib/format";

/**
 * Noms accessibles des boutons répétés d'une carte à l'autre (cœur, listes, monter, descendre…) : ils citent l'article,
 * sinon la liste des boutons d'un lecteur d'écran répète N fois « Favori » sans dire lequel (A11Y-23). Le nom commence
 * par l'action, pour la commande vocale et la navigation par première lettre ; l'état (aria-pressed) n'y entre pas.
 */

/** Titre raccourci à un nom de bouton : 12 mots au plus, espaces normalisés. */
export function shortTitle(title: string | null | undefined): string {
  const clean = (title ?? "").replace(/\s+/g, " ").trim();
  return clean ? truncateWords(clean, 12) : "cet article";
}

/** « Favori : Cancer statistics, 2025 ». */
export function favoriteLabel(title: string | null | undefined): string {
  return `Favori : ${shortTitle(title)}`;
}

/** Libellé visible d'abord (« Ajouter à une liste », « Dans 2 listes, modifier »), puis l'article. */
export function withArticle(label: string, title: string | null | undefined): string {
  return `${label} : ${shortTitle(title)}`;
}

/** Les flèches de l'ordre manuel d'une liste. */
export function moveLabel(direction: "up" | "down", title: string | null | undefined): string {
  return `${direction === "up" ? "Monter" : "Descendre"} « ${shortTitle(title)} » dans la liste`;
}

/** Début d'un passage cité dans un nom de bouton : points de suspension seulement s'il est coupé. */
export function excerpt(text: string, max = 40): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
}
