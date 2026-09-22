/**
 * Client minimal pour l'API OpenAlex (https://docs.openalex.org).
 * Pas de clé requise. Un `mailto` (OPENALEX_MAILTO) donne accès au "polite pool".
 */

const BASE = "https://api.openalex.org";

export interface Author {
  id: string | null;
  display_name: string;
  orcid: string | null;
}

export interface Authorship {
  author_position: "first" | "middle" | "last";
  author: Author;
  institutions: { id: string; display_name: string; country_code: string | null }[];
}

export interface Source {
  id: string;
  display_name: string;
  type: string | null;
  is_core?: boolean;
  is_in_doaj?: boolean;
  host_organization_name?: string | null;
}

export interface Location {
  is_oa: boolean;
  landing_page_url: string | null;
  pdf_url: string | null;
  source: Source | null;
  license: string | null;
  version: string | null;
}

export interface TopicRef {
  id: string;
  display_name: string;
  score?: number;
  subfield?: { id: string; display_name: string };
  field?: { id: string; display_name: string };
  domain?: { id: string; display_name: string };
}

export interface Work {
  id: string;
  doi: string | null;
  title: string | null;
  display_name: string | null;
  publication_year: number | null;
  publication_date: string | null;
  type: string;
  language: string | null;
  cited_by_count: number;
  referenced_works_count?: number;
  is_retracted?: boolean;
  authorships: Authorship[];
  primary_location: Location | null;
  best_oa_location: Location | null;
  open_access: { is_oa: boolean; oa_status: string; oa_url: string | null };
  primary_topic: TopicRef | null;
  topics?: TopicRef[];
  keywords?: { id: string; display_name: string; score: number }[];
  related_works?: string[];
  abstract_inverted_index?: Record<string, number[]> | null;
  biblio?: {
    volume: string | null;
    issue: string | null;
    first_page: string | null;
    last_page: string | null;
  };
}

export interface Topic {
  id: string;
  display_name: string;
  description: string | null;
  works_count: number;
  keywords: string[];
  subfield: { id: string; display_name: string };
  field: { id: string; display_name: string };
  domain: { id: string; display_name: string };
}

export interface Page<T> {
  meta: { count: number; page: number; per_page: number };
  results: T[];
}

export type SortKey = "relevance" | "cited" | "recent";

export interface SearchParams {
  q?: string;
  page?: number;
  perPage?: number;
  sort?: SortKey;
  /** Type OpenAlex : article, review, preprint, book-chapter, conference-paper… */
  type?: string;
  yearFrom?: number;
  yearTo?: number;
  oaOnly?: boolean;
  /** Identifiant de field OpenAlex (ex. "17" pour Computer Science). */
  field?: string;
  /** Identifiant de topic OpenAlex (ex. "T11273"). */
  topic?: string;
  /** Travaux qui citent cet identifiant (ex. "W3138516171"). */
  cites?: string;
  /** Code langue ISO 639-1 (ex. "fr"). */
  language?: string;
  /** Restreindre aux revues indexées (défaut : oui). Ignoré pour les thèses, hébergées hors revues. */
  coreOnly?: boolean;
  /** Identifiant d'auteur OpenAlex (ex. "A5101976576"). */
  author?: string;
}

/** Champs demandés à l'API pour les listes (réduit la taille des réponses). */
const LIST_SELECT = [
  "id",
  "doi",
  "title",
  "display_name",
  "publication_year",
  "publication_date",
  "type",
  "language",
  "cited_by_count",
  "authorships",
  "primary_location",
  "best_oa_location",
  "open_access",
  "primary_topic",
  "abstract_inverted_index",
].join(",");

const DETAIL_SELECT = [
  LIST_SELECT,
  "referenced_works_count",
  "is_retracted",
  "topics",
  "keywords",
  "related_works",
  "biblio",
].join(",");

/** Filtres appliqués partout : pas de paratexte (couvertures, sommaires…), pas de rétractés. */
const BASE_FILTERS = ["is_paratext:false", "is_retracted:false"];

/**
 * Types de documents « vérifiés » : articles et revues de littérature (évalués par les pairs),
 * thèses et ouvrages universitaires. Exclut préprints, éditoriaux, lettres, errata, rapports, jeux de données…
 */
export const VERIFIED_TYPES = "article|review|book|book-chapter|dissertation";

/** Revues et collections indexées (liste « core » d'OpenAlex, proche de Scopus / Web of Science). */
const CORE_SOURCE = "primary_location.source.is_core:true";

class OpenAlexError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function get<T>(
  path: string,
  params: Record<string, string | number | undefined>,
  revalidate = 600,
): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  const mailto = process.env.OPENALEX_MAILTO;
  if (mailto) url.searchParams.set("mailto", mailto);

  const res = await fetch(url, { next: { revalidate } });
  if (!res.ok) {
    throw new OpenAlexError(`OpenAlex ${res.status} sur ${path}`, res.status);
  }
  return (await res.json()) as T;
}

/** "https://openalex.org/W123" → "W123" */
export function shortId(id: string): string {
  return id.replace(/^https?:\/\/openalex\.org\//, "");
}

function sortParam(sort: SortKey | undefined, hasQuery: boolean): string | undefined {
  switch (sort) {
    case "cited":
      return "cited_by_count:desc";
    case "recent":
      return "publication_date:desc";
    default:
      return hasQuery ? "relevance_score:desc" : "cited_by_count:desc";
  }
}

export async function searchWorks(p: SearchParams): Promise<Page<Work>> {
  const filters = [...BASE_FILTERS, `type:${p.type || VERIFIED_TYPES}`];
  if (p.coreOnly !== false && p.type !== "dissertation") filters.push(CORE_SOURCE);
  if (p.oaOnly) filters.push("open_access.is_oa:true");
  if (p.yearFrom || p.yearTo) {
    filters.push(`publication_year:${p.yearFrom ?? ""}-${p.yearTo ?? ""}`);
  }
  if (p.field) filters.push(`primary_topic.field.id:fields/${p.field}`);
  if (p.topic) filters.push(`primary_topic.id:${p.topic}`);
  if (p.cites) filters.push(`cites:${p.cites}`);
  if (p.language) filters.push(`language:${p.language}`);
  if (p.author) filters.push(`authorships.author.id:${p.author}`);

  // Certaines notices portent une date future erronée : on plafonne à aujourd'hui.
  filters.push(`to_publication_date:${new Date().toISOString().slice(0, 10)}`);

  const q = p.q?.trim();
  return get<Page<Work>>("/works", {
    search: q || undefined,
    filter: filters.join(","),
    sort: sortParam(p.sort, Boolean(q)),
    page: p.page ?? 1,
    "per-page": p.perPage ?? 20,
    select: LIST_SELECT,
  });
}

export async function getWork(id: string): Promise<Work | null> {
  try {
    return await get<Work>(`/works/${shortId(id)}`, { select: DETAIL_SELECT }, 3600);
  } catch (e) {
    if (e instanceof OpenAlexError && e.status === 404) return null;
    throw e;
  }
}

/** Récupère plusieurs travaux par identifiant, dans l'ordre demandé. */
export async function getWorksByIds(ids: string[]): Promise<Work[]> {
  const short = ids.map(shortId).filter(Boolean).slice(0, 50);
  if (short.length === 0) return [];
  const page = await get<Page<Work>>(
    "/works",
    {
      filter: [...BASE_FILTERS, `type:${VERIFIED_TYPES}`, `ids.openalex:${short.join("|")}`].join(","),
      "per-page": short.length,
      select: LIST_SELECT,
    },
    3600,
  );
  const byId = new Map(page.results.map((w) => [shortId(w.id), w]));
  return short.map((id) => byId.get(id)).filter((w): w is Work => Boolean(w));
}

/** Travaux du même sujet principal, hors l'article courant. */
export async function getWorksBySameTopic(topicId: string, excludeId: string, n = 6): Promise<Work[]> {
  const page = await get<Page<Work>>(
    "/works",
    {
      filter: [...BASE_FILTERS, `type:${VERIFIED_TYPES}`, CORE_SOURCE, `primary_topic.id:${shortId(topicId)}`, "has_abstract:true"].join(","),
      sort: "cited_by_count:desc",
      "per-page": n + 1,
      select: LIST_SELECT,
    },
    3600,
  );
  return page.results.filter((w) => shortId(w.id) !== shortId(excludeId)).slice(0, n);
}

/** Sous-thèmes (topics) d'un field, triés par volume. */
export async function getTopicsForField(fieldId: string, n = 12): Promise<Topic[]> {
  const page = await get<Page<Topic>>(
    "/topics",
    {
      filter: `field.id:fields/${fieldId}`,
      sort: "works_count:desc",
      "per-page": n,
      select: "id,display_name,description,works_count,keywords,subfield,field,domain",
    },
    86400,
  );
  return page.results;
}

export async function getTopic(topicId: string): Promise<Topic | null> {
  try {
    return await get<Topic>(`/topics/${shortId(topicId)}`, {}, 86400);
  } catch (e) {
    if (e instanceof OpenAlexError && e.status === 404) return null;
    throw e;
  }
}

/**
 * Sélection pour la page d'accueil : articles récents, en accès ouvert,
 * publiés dans des revues "core" (indexées), les plus cités.
 */
export async function getFeaturedWorks(n = 8, fieldId?: string): Promise<Work[]> {
  const year = new Date().getFullYear();
  const filters = [
    ...BASE_FILTERS,
    `publication_year:${year - 1}-${year}`,
    "type:article|review",
    "open_access.is_oa:true",
    "has_abstract:true",
    CORE_SOURCE,
  ];
  if (fieldId) filters.push(`primary_topic.field.id:fields/${fieldId}`);
  const page = await get<Page<Work>>(
    "/works",
    { filter: filters.join(","), sort: "cited_by_count:desc", "per-page": n, select: LIST_SELECT },
    3600,
  );
  return page.results;
}

export interface AuthorProfile {
  id: string;
  name: string;
  orcid: string | null;
  worksCount: number;
  citedByCount: number;
  hIndex: number | null;
  institution: { name: string; homepage: string | null; country: string | null } | null;
}

interface RawAuthor {
  id: string;
  display_name: string;
  orcid: string | null;
  works_count: number;
  cited_by_count: number;
  summary_stats?: { h_index?: number };
  last_known_institutions?: { id: string; display_name: string; country_code: string | null }[];
}

/** Profil court d'un auteur + site de sa dernière institution connue. */
export async function getAuthorProfile(id: string): Promise<AuthorProfile | null> {
  let a: RawAuthor;
  try {
    a = await get<RawAuthor>(
      `/authors/${shortId(id)}`,
      { select: "id,display_name,orcid,works_count,cited_by_count,summary_stats,last_known_institutions" },
      86400,
    );
  } catch (e) {
    if (e instanceof OpenAlexError && e.status === 404) return null;
    throw e;
  }
  const inst = a.last_known_institutions?.[0];
  let homepage: string | null = null;
  if (inst) {
    try {
      const i = await get<{ homepage_url: string | null }>(`/institutions/${shortId(inst.id)}`, { select: "homepage_url" }, 86400);
      homepage = i.homepage_url;
    } catch {
      /* institution sans fiche : pas de lien */
    }
  }
  return {
    id: shortId(a.id),
    name: a.display_name,
    orcid: a.orcid,
    worksCount: a.works_count,
    citedByCount: a.cited_by_count,
    hIndex: a.summary_stats?.h_index ?? null,
    institution: inst ? { name: inst.display_name, homepage, country: inst.country_code } : null,
  };
}
