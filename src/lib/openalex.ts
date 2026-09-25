/**
 * Client minimal pour l'API OpenAlex (https://help.openalex.org/api/).
 * Fonctionne sans clé, mais OpenAlex limite les recherches anonymes en période de charge (429) :
 * une clé gratuite (OPENALEX_API_KEY, paramètre `api_key`) multiplie le budget quotidien par dix.
 * Un `mailto` (OPENALEX_MAILTO) identifie poliment l'application.
 */

import { safeHttpUrl } from "@/lib/text";

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
  /** Date d'entrée dans OpenAlex ; demandée seulement par les listes « récentes » (garde de datation). */
  created_date?: string;
  is_retracted?: boolean;
  authorships: Authorship[];
  primary_location: Location | null;
  best_oa_location: Location | null;
  /** Toutes les copies connues (éditeur, PMC, arXiv, HAL…) ; présent sur la fiche détaillée seulement. */
  locations?: Location[];
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

/** « Pour vous » : les cartes compactes n'affichent pas le résumé, inutile de le transporter (PERF-25). */
const RECO_SELECT = LIST_SELECT.replace(",abstract_inverted_index", "");

const DETAIL_SELECT = [
  LIST_SELECT,
  "referenced_works_count",
  "is_retracted",
  "topics",
  "keywords",
  "related_works",
  "biblio",
  "locations",
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

/**
 * Listes « récentes » (sélection du moment, « Pour vous ») : OpenAlex re-date parfois des textes anciens
 * à leur mise en ligne numérique (un article de 1969 daté 2025, un préprint de 2023 daté 2026). Ces fiches
 * n'ont presque jamais de bibliographie extraite : on l'exige côté API, puis `isPlausiblyRecent` écarte le reste.
 */
const HAS_REFERENCES = "referenced_works_count:>0";
const RECENT_SELECT_EXTRA = ",created_date,referenced_works_count";

/** Identifiants attribués avant 2022 (héritage Microsoft Academic, `W1…`-`W3…`) : texte forcément antérieur. */
const FIRST_NEW_WORK_ID = 4_000_000_000;

/**
 * Vrai si l'article a une année et si rien n'indique qu'il est plus ancien que sa date de publication :
 * fiche créée plus d'un an avant cette date, ou identifiant hérité d'avant 2022 pour une date récente.
 */
export function isPlausiblyRecent(w: Pick<Work, "id" | "publication_year" | "created_date">, now = new Date()): boolean {
  const year = w.publication_year;
  if (!year) return false;
  const created = w.created_date ? Number(w.created_date.slice(0, 4)) : NaN;
  if (Number.isFinite(created) && created < year - 1) return false;
  const num = Number(shortId(w.id).slice(1));
  if (Number.isFinite(num) && num > 0 && num < FIRST_NEW_WORK_ID && year >= now.getFullYear() - 3) return false;
  return true;
}

export class OpenAlexError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
  /** OpenAlex refuse temporairement (quota anonyme, charge) : l'utilisateur peut réessayer. */
  get isRateLimited() {
    return this.status === 429;
  }
}

/** Ajoute clé et mailto à une URL OpenAlex. Partagé avec la route d'autocomplétion. */
export function withCredentials(url: URL): URL {
  const key = process.env.OPENALEX_API_KEY?.trim();
  if (key) url.searchParams.set("api_key", key);
  const mailto = process.env.OPENALEX_MAILTO?.trim();
  if (mailto && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mailto) && !mailto.endsWith("@example.com")) {
    url.searchParams.set("mailto", mailto);
  }
  return url;
}

/** Pas de relance d'un 504 : OpenAlex ne le renvoie qu'après environ 9 s de travail, le relancer doublerait l'attente. */
const RETRYABLE = new Set([429, 500, 502, 503]);

/**
 * Budget total d'un appel à OpenAlex, relance comprise (une notice absurde peut le faire tourner une dizaine de
 * secondes) : au-delà, la page répond par son écran d'erreur plutôt que d'occuper la fonction (PERF-07).
 */
const DEADLINE_MS = 8000;
const RETRY_DELAY_MS = 1200;
/** En dessous, une relance n'aurait pas le temps d'aboutir : on répond tout de suite. */
const MIN_RETRY_BUDGET_MS = 3000;

/**
 * Délai accordé à la relance d'une réponse `status` reçue après `elapsedMs`, ou null s'il ne faut pas relancer :
 * statut non passager, ou budget restant (attente comprise) trop court. Exportée pour les tests.
 */
export function retryBudget(status: number, elapsedMs: number, deadlineMs = DEADLINE_MS): number | null {
  if (!RETRYABLE.has(status)) return null;
  const left = deadlineMs - elapsedMs - RETRY_DELAY_MS;
  return left >= MIN_RETRY_BUDGET_MS ? left : null;
}

/**
 * `fetch` borné dans le temps. Volontairement sans `AbortSignal` : Next ne déduplique pas un fetch qui en porte un, et
 * `generateMetadata` et la page lisent la même notice dans le même rendu. La requête abandonnée finit en arrière-plan
 * (et alimente le cache si elle aboutit).
 */
async function fetchWithDeadline(url: URL, revalidate: number, path: string, timeoutMs = DEADLINE_MS): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new OpenAlexError(`OpenAlex hors délai (${DEADLINE_MS} ms) sur ${path}`, 504)), timeoutMs);
  });
  try {
    return await Promise.race([fetch(url, { next: { revalidate } }), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `path` est concaténé tel quel à l'adresse de l'API : tout identifiant venu de l'extérieur y est encodé
 * (encodeURIComponent) pour qu'un `?`, un `#` ou un `/` ne puisse pas sortir de son segment (SEC-15).
 */
async function get<T>(
  path: string,
  params: Record<string, string | number | undefined>,
  revalidate = 600,
): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  withCredentials(url);

  // Une seule relance rapide : suffit pour les à-coups, sans faire attendre l'utilisateur sur un vrai 429. Elle tient
  // dans le budget de l'appel (8 s en tout). Pas de relance après un délai dépassé ni après un 504 : OpenAlex est
  // alors saturé, on répond tout de suite.
  const started = Date.now();
  let res = await fetchWithDeadline(url, revalidate, path);
  const budget = retryBudget(res.status, Date.now() - started);
  if (budget !== null) {
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    res = await fetchWithDeadline(url, revalidate, path, budget);
  }
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
    return await get<Work>(`/works/${encodeURIComponent(shortId(id))}`, { select: DETAIL_SELECT }, 3600);
  } catch (e) {
    if (e instanceof OpenAlexError && e.status === 404) return null;
    throw e;
  }
}

/** Valeurs au plus dans un filtre « ou » d'OpenAlex (`ids.openalex:A|B|…`). */
const OR_FILTER_MAX = 100;

/**
 * Parmi `ids`, ceux qu'OpenAlex marque aujourd'hui comme rétractés. Sert aux favoris, listes et outils MCP, dont les
 * instantanés datent de l'enregistrement : la rétractation est toujours recalculée ici, jamais lue d'un instantané.
 * Une requête par lot de 100 (seuls les rétractés reviennent, d'où `select=id`), mise en cache une heure.
 */
export async function getRetractedIds(ids: string[]): Promise<Set<string>> {
  const unique = [...new Set(ids.map((id) => shortId(id).toUpperCase()).filter((id) => /^W\d+$/.test(id)))];
  const lots: string[][] = [];
  for (let i = 0; i < unique.length; i += OR_FILTER_MAX) lots.push(unique.slice(i, i + OR_FILTER_MAX));
  const pages = await Promise.all(
    lots.map((lot) =>
      get<Page<{ id: string }>>(
        "/works",
        { filter: `ids.openalex:${lot.join("|")},is_retracted:true`, select: "id", "per-page": OR_FILTER_MAX },
        3600,
      ),
    ),
  );
  return new Set(pages.flatMap((p) => p.results.map((w) => shortId(w.id).toUpperCase())));
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

/** Sujet principal et articles apparentés (related_works) des graines d'une recommandation, dans l'ordre demandé. */
export async function getSeedMeta(ids: string[]): Promise<Pick<Work, "id" | "display_name" | "title" | "primary_topic" | "related_works">[]> {
  const short = ids.map(shortId).filter(Boolean).slice(0, 50);
  if (short.length === 0) return [];
  const page = await get<Page<Pick<Work, "id" | "display_name" | "title" | "primary_topic" | "related_works">>>(
    "/works",
    { filter: `ids.openalex:${short.join("|")}`, "per-page": short.length, select: "id,display_name,title,primary_topic,related_works" },
    3600,
  );
  const byId = new Map(page.results.map((w) => [shortId(w.id), w]));
  return short.map((id) => byId.get(id)).filter((w): w is NonNullable<typeof w> => Boolean(w));
}

/** Travaux par identifiant, avec les garde-fous qualité de la recherche (types vérifiés, revues indexées, résumé). */
export async function getQualityWorksByIds(ids: string[]): Promise<Work[]> {
  const short = ids.map(shortId).filter(Boolean).slice(0, 50);
  if (short.length === 0) return [];
  const page = await get<Page<Work>>(
    "/works",
    {
      filter: [...BASE_FILTERS, `type:${VERIFIED_TYPES}`, CORE_SOURCE, "has_abstract:true", `ids.openalex:${short.join("|")}`].join(","),
      "per-page": short.length,
      select: RECO_SELECT,
    },
    3600,
  );
  const byId = new Map(page.results.map((w) => [shortId(w.id), w]));
  return short.map((id) => byId.get(id)).filter((w): w is Work => Boolean(w));
}

/**
 * Articles récents (depuis `sinceYear`) les plus cités d'un sujet, hors identifiants déjà vus : matière de « Pour vous ».
 * Mêmes garde-fous que partout : types vérifiés, revues indexées, résumé présent.
 */
export async function getRecentByTopic(topicId: string, sinceYear: number, n = 6): Promise<Work[]> {
  const page = await get<Page<Work>>(
    "/works",
    {
      filter: [...BASE_FILTERS, `type:${VERIFIED_TYPES}`, CORE_SOURCE, `primary_topic.id:${shortId(topicId)}`, `publication_year:>${sinceYear - 1}`, "has_abstract:true", HAS_REFERENCES].join(","),
      sort: "cited_by_count:desc",
      "per-page": Math.min(n * 2, 50),
      select: RECO_SELECT + RECENT_SELECT_EXTRA,
    },
    3600,
  );
  return page.results.filter((w) => isPlausiblyRecent(w)).slice(0, n);
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
    return await get<Topic>(`/topics/${encodeURIComponent(shortId(topicId))}`, {}, 86400);
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
    HAS_REFERENCES,
  ];
  if (fieldId) filters.push(`primary_topic.field.id:fields/${fieldId}`);
  const page = await get<Page<Work>>(
    "/works",
    { filter: filters.join(","), sort: "cited_by_count:desc", "per-page": Math.min(n * 2, 50), select: LIST_SELECT + RECENT_SELECT_EXTRA },
    3600,
  );
  return page.results.filter((w) => isPlausiblyRecent(w)).slice(0, n);
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

/**
 * Profil court d'un auteur + site de sa dernière institution connue.
 * `fallbackInstitutionId` : institution indiquée sur l'article, utilisée si OpenAlex n'en connaît aucune pour l'auteur.
 */
export async function getAuthorProfile(id: string, fallbackInstitutionId?: string | null): Promise<AuthorProfile | null> {
  let a: RawAuthor;
  try {
    a = await get<RawAuthor>(
      `/authors/${encodeURIComponent(shortId(id))}`,
      { select: "id,display_name,orcid,works_count,cited_by_count,summary_stats,last_known_institutions" },
      86400,
    );
  } catch (e) {
    if (e instanceof OpenAlexError && e.status === 404) return null;
    throw e;
  }
  let inst: { display_name: string; country_code: string | null } | undefined = a.last_known_institutions?.[0];
  const instId = a.last_known_institutions?.[0]?.id ?? fallbackInstitutionId ?? null;
  let homepage: string | null = null;
  if (instId) {
    try {
      const i = await get<{ display_name: string; homepage_url: string | null; country_code: string | null }>(
        `/institutions/${encodeURIComponent(shortId(instId))}`,
        { select: "display_name,homepage_url,country_code" },
        86400,
      );
      homepage = safeHttpUrl(i.homepage_url);
      inst ??= { display_name: i.display_name, country_code: i.country_code };
    } catch {
      /* institution sans fiche : pas de lien */
    }
  }
  return {
    id: shortId(a.id),
    name: a.display_name,
    orcid: safeHttpUrl(a.orcid),
    worksCount: a.works_count,
    citedByCount: a.cited_by_count,
    hIndex: a.summary_stats?.h_index ?? null,
    institution: inst ? { name: inst.display_name, homepage, country: inst.country_code } : null,
  };
}
