import { AUTHOR_ID, normalizeId, TOPIC_ID, WORK_ID } from "@/lib/ids";
import type { SearchParams } from "@/lib/openalex";

/** Paramètres d'URL de la recherche : extraits de `components/results.tsx` pour être testés sans React. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/**
 * Types de document proposés par les filtres (valeur = filtre OpenAlex) : une valeur hors de cette liste est ignorée,
 * ce qui garde la garantie « documents vérifiés » (sinon `?type=preprint` la contournerait, SEC-15).
 */
export const DOC_TYPES = [
  { value: "article", label: "Articles" },
  { value: "review", label: "Revues de littérature" },
  { value: "dissertation", label: "Thèses" },
  { value: "book|book-chapter", label: "Livres et chapitres" },
] as const;

/** Langues proposées par les filtres (codes ISO 639-1 d'OpenAlex). */
export const LANGUAGES = [
  { value: "fr", label: "Français" },
  { value: "en", label: "Anglais" },
  { value: "es", label: "Espagnol" },
  { value: "de", label: "Allemand" },
  { value: "pt", label: "Portugais" },
  { value: "it", label: "Italien" },
] as const;

/** Identifiant OpenAlex court attendu dans l'URL (sujet `T…`, article `W…`, auteur `A…`), en majuscules ; sinon undefined (le filtre est ignoré). */
function openAlexId(v: string | undefined, re: RegExp): string | undefined {
  return normalizeId(v, re) ?? undefined;
}

function oneOf(v: string | undefined, options: readonly { value: string }[]): string | undefined {
  return options.some((o) => o.value === v) ? v : undefined;
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function int(v: string | undefined): number | undefined {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Convertit les paramètres d'URL en paramètres de recherche OpenAlex. Chaque filtre est validé (liste blanche ou forme
 * d'identifiant) : une valeur inattendue est ignorée au lieu d'être glissée dans le filtre ou le chemin OpenAlex.
 */
export function parseSearchParams(sp: RawSearchParams, extra: Partial<SearchParams> = {}): SearchParams {
  const sort = first(sp.sort);
  return {
    q: first(sp.q),
    page: Math.max(1, int(first(sp.page)) ?? 1),
    perPage: 20,
    sort: sort === "cited" || sort === "recent" ? sort : "relevance",
    type: oneOf(first(sp.type), DOC_TYPES),
    oaOnly: first(sp.oa) === "1",
    yearFrom: int(first(sp.from)),
    yearTo: int(first(sp.to)),
    topic: openAlexId(first(sp.topic), TOPIC_ID),
    cites: openAlexId(first(sp.cites), WORK_ID),
    language: oneOf(first(sp.lang), LANGUAGES),
    // src=any : toutes les sources vérifiées ; sinon revues indexées seulement (« all » est réservé au défaut des filtres).
    coreOnly: first(sp.src) !== "any",
    author: openAlexId(first(sp.author), AUTHOR_ID),
    ...extra,
  };
}

export function buildHref(base: string, sp: RawSearchParams, patch: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const val = first(v);
    if (val) params.set(k, val);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === "") params.delete(k);
    else params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/** OpenAlex limite la pagination simple à 10 000 résultats. */
export const MAX_RESULTS = 10_000;

/** Numéro de la dernière page atteignable (au moins 1). */
export function lastPageOf(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(Math.min(total, MAX_RESULTS) / perPage));
}

/**
 * Titre d'une page de résultats : la page est ajoutée au-delà de la première, pour que le titre change à la pagination
 * (l'annonceur de routes de Next ne lit que les titres qui changent, A11Y-12).
 */
export function pagedTitle(title: string, page: number | undefined): string {
  return page && page > 1 ? `${title} — page ${page}` : title;
}

/** Message lu aux lecteurs d'écran à l'arrivée d'une liste de résultats (région d'annonce, WCAG 4.1.3). */
export function resultsMessage(total: number, page: number, perPage: number, q?: string): string {
  const n = new Intl.NumberFormat("fr-FR").format(total);
  const count = `${n} résultat${total > 1 ? "s" : ""}${q ? ` pour « ${q} »` : ""}`;
  const last = lastPageOf(total, perPage);
  return last > 1 ? `${count}, page ${page} sur ${new Intl.NumberFormat("fr-FR").format(last)}.` : `${count}.`;
}
