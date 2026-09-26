import type { SearchParams } from "@/lib/openalex";

/** Paramètres d'URL de la recherche : extraits de `components/results.tsx` pour être testés sans React. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function int(v: string | undefined): number | undefined {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Convertit les paramètres d'URL en paramètres de recherche OpenAlex. */
export function parseSearchParams(sp: RawSearchParams, extra: Partial<SearchParams> = {}): SearchParams {
  const sort = first(sp.sort);
  return {
    q: first(sp.q),
    page: Math.max(1, int(first(sp.page)) ?? 1),
    perPage: 20,
    sort: sort === "cited" || sort === "recent" ? sort : "relevance",
    type: first(sp.type),
    oaOnly: first(sp.oa) === "1",
    yearFrom: int(first(sp.from)),
    yearTo: int(first(sp.to)),
    topic: first(sp.topic),
    cites: first(sp.cites),
    language: first(sp.lang),
    // src=any : toutes les sources vérifiées ; sinon revues indexées seulement (« all » est réservé au défaut des filtres).
    coreOnly: first(sp.src) !== "any",
    author: first(sp.author),
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
