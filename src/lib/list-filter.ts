/**
 * Filtre et affichage par tranches des grandes listes du compte (/favoris jusqu'à 1 000 articles, /citations jusqu'à
 * 2 000 passages). Module pur, partagé client / serveur (PERF-11).
 */

/** Taille d'une tranche affichée ; « Afficher plus » en ajoute autant. */
export const PAGE_SIZE = 50;

/** Minuscules sans accents : « Écologie » et « ecologie » se retrouvent. */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Texte plié de chaque élément, calculé une fois par liste (et non à chaque frappe) : 2 000 citations longues se
 * filtrent en moins d'une milliseconde au lieu de plusieurs dizaines.
 */
export function foldedIndex<T extends { id: string }>(items: readonly T[], text: (item: T) => string): Map<string, string> {
  return new Map(items.map((item) => [item.id, fold(text(item))]));
}

/** Les éléments dont le texte plié contient la requête (pliée ici) ; tous si la requête est vide. */
export function filterFolded<T extends { id: string }>(items: readonly T[], index: ReadonlyMap<string, string>, query: string): T[] {
  const nq = fold(query.trim());
  if (!nq) return [...items];
  return items.filter((item) => index.get(item.id)?.includes(nq) ?? false);
}

/** Regroupe par clé en gardant l'ordre de première apparition (citations groupées par article). */
export function groupBy<T>(items: readonly T[], key: (item: T) => string): T[][] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const arr = map.get(k);
    if (arr) arr.push(item);
    else map.set(k, [item]);
  }
  return [...map.values()];
}

/** Nombre de clés distinctes (articles cités), sans construire les groupes. */
export function countDistinct<T>(items: readonly T[], key: (item: T) => string): number {
  return new Set(items.map(key)).size;
}

/**
 * Tranche affichée : `n` tant que `key` (filtre, liste, tri) ne change pas, revient à PAGE_SIZE sinon. Posée avec la
 * clé qui l'a vue naître, elle se remet à zéro pendant le rendu, sans effet ni second rendu.
 */
export interface PageState {
  key: string;
  n: number;
}

export function visibleCount(state: PageState, key: string): number {
  return state.key === key ? state.n : PAGE_SIZE;
}

export function nextPage(state: PageState, key: string): PageState {
  return { key, n: visibleCount(state, key) + PAGE_SIZE };
}
