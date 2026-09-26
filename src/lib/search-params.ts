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

/** Identifiants OpenAlex courts attendus dans l'URL : sujet `T…`, article `W…`, auteur `A…`. */
const TOPIC_ID = /^T\d{1,15}$/i;
const WORK_ID = /^W\d{1,15}$/i;
const AUTHOR_ID = /^A\d{1,15}$/i;

/** L'identifiant en majuscules s'il a la forme attendue, sinon undefined (le filtre est ignoré). */
function openAlexId(v: string | undefined, re: RegExp): string | undefined {
  const id = v?.trim();
  return id && re.test(id) ? id.toUpperCase() : undefined;
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
