import type { Work } from "@/lib/openalex";
import { DOC_ID, DOI_URL, shortId, WORK_ID } from "@/lib/ids";
import type { Biblio, CitationSource } from "@/lib/citation";
import { authorNames, formatAuthors, venueName, workTitle } from "@/lib/format";
import { cleanText, fold } from "@/lib/text";
import { MAX_COLLECTIONS } from "@/lib/collections-shared";

/**
 * Instantané d'un article enregistré en favori : assez de métadonnées pour afficher la liste
 * et exporter une citation sans rappeler OpenAlex. Clé = identifiant OpenAlex `W…`.
 * Partagé client / serveur : aucun import serveur ici.
 */
export interface FavoriteSnapshot {
  id: string;
  title: string;
  authors: string;
  authorNames: string[];
  venue: string | null;
  year: number | null;
  doi: string | null;
  type: string;
  isOa: boolean;
  citedByCount: number;
  topic: string | null;
  /** Volume, numéro, pages (QUAL-02) : absent si OpenAlex n'en donne aucun, et des favoris enregistrés avant ce champ. */
  biblio?: Biblio;
}

export interface Favorite extends FavoriteSnapshot {
  /** Date d'ajout, ISO 8601. */
  addedAt: string | null;
}

export const MAX_FAVORITES = 1000;

/** Champs d'un instantané, dans l'ordre du type (`id` compris). */
const SNAPSHOT_FIELDS = ["id", "title", "authors", "venue", "year", "doi", "type", "isOa", "citedByCount", "topic"] as const;

/**
 * L'instantané stocké (données Firestore) est déjà celui-ci : pas de réécriture du document favori, ni de conflit
 * entre deux ajouts simultanés dans des listes (NEW-9). Un champ absent du document compte comme une différence.
 */
export function sameSnapshot(stored: Record<string, unknown> | undefined, s: FavoriteSnapshot): boolean {
  if (!stored) return false;
  if (!SNAPSHOT_FIELDS.every((k) => stored[k] === s[k])) return false;
  const biblio = biblioFrom(stored.biblio, storedString);
  if (!BIBLIO_KEYS.every((k) => (biblio?.[k] ?? null) === (s.biblio?.[k] ?? null))) return false;
  const names = stored.authorNames;
  return Array.isArray(names) && names.length === s.authorNames.length && names.every((n, i) => n === s.authorNames[i]);
}

const BIBLIO_KEYS = ["volume", "issue", "firstPage", "lastPage"] as const;

const storedString = (v: unknown) => (typeof v === "string" ? v : null);
/** Chaîne courte nettoyée (caractères de contrôle et bidi retirés), ou null. */
const shortText = (v: unknown) => cleanText(v, 20) || null;

/** Volume, numéro et pages lus champ par champ ; `undefined` quand aucun n'est connu. */
function biblioFrom(input: unknown, read: (v: unknown) => string | null): Biblio | undefined {
  if (!input || typeof input !== "object") return undefined;
  const o = input as Record<string, unknown>;
  const b: Biblio = { volume: read(o.volume), issue: read(o.issue), firstPage: read(o.firstPage), lastPage: read(o.lastPage) };
  return BIBLIO_KEYS.some((k) => b[k] !== null) ? b : undefined;
}

const optionalBiblio = (biblio: Biblio | undefined) => (biblio ? { biblio } : {});

/**
 * L'instantané tel qu'écrit dans Firestore : `biblio` toujours présent (null s'il n'y en a pas) et, s'il existe, avec
 * ses quatre clés. Une écriture fusionnée (`merge: true`) remplace alors entièrement le `biblio` précédent au lieu de
 * garder le volume ou les pages d'une version antérieure.
 */
export function snapshotForStorage(s: FavoriteSnapshot): Omit<FavoriteSnapshot, "biblio"> & { biblio: Biblio | null } {
  return { ...s, biblio: s.biblio ?? null };
}

/** Même ensemble d'identifiants (ordre indifférent) : un rechargement sans changement ne re-rend rien (PERF-12). */
export function sameIdSet(current: ReadonlySet<string>, next: readonly string[]): boolean {
  if (current.size !== next.length) return false;
  return next.every((id) => current.has(id));
}
/** Auteurs gardés au plus dans un instantané. */
const MAX_SNAPSHOT_AUTHORS = 50;

export function snapshotFromWork(work: Work): FavoriteSnapshot {
  const names = authorNames(work);
  const b = work.biblio;
  const biblio = biblioFrom(b && { volume: b.volume, issue: b.issue, firstPage: b.first_page, lastPage: b.last_page }, shortText);
  return {
    id: shortId(work.id),
    title: workTitle(work),
    authors: formatAuthors(work, 3),
    // Au-delà de 50 auteurs, le dernier est gardé à la place du 50e : la règle APA « 19 premiers, …, dernier » reste juste.
    authorNames: names.length > MAX_SNAPSHOT_AUTHORS ? [...names.slice(0, MAX_SNAPSHOT_AUTHORS - 1), names[names.length - 1]] : names,
    venue: venueName(work),
    year: work.publication_year,
    doi: work.doi,
    type: work.type,
    isOa: work.open_access.is_oa,
    citedByCount: work.cited_by_count,
    topic: work.primary_topic?.display_name ?? null,
    ...optionalBiblio(biblio),
  };
}

/**
 * Source de citation d'un article OpenAlex (fiche, outil MCP get_article) : l'instantané, volume et pages compris, avec
 * tous les auteurs (pas seulement les 50 gardés en favori). Passe par le même module de citation que
 * les favoris : un article est cité de la même façon partout (QUAL-02).
 */
export function citationFromWork(work: Work): CitationSource {
  return { ...snapshotFromWork(work), authorNames: authorNames(work) };
}

/**
 * Instantané relu depuis Firestore (favori, article d'une note ou d'un surlignage), sans rejet : chaque champ est
 * vérifié par son type et prend sa valeur par défaut s'il manque ou n'a pas la bonne forme. Un seul décodage pour
 * tous les modules (QUAL-11) : un champ ajouté à l'instantané ne peut plus disparaître d'un écran.
 * `fallbackId` : identifiant pris quand le document n'en porte pas (celui du document favori, de la note…).
 */
export function snapshotFromData(input: unknown, fallbackId: string): FavoriteSnapshot {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    id: str(o.id) || fallbackId,
    title: str(o.title) ?? "",
    authors: str(o.authors) ?? "",
    authorNames: Array.isArray(o.authorNames) ? o.authorNames.filter((n): n is string => typeof n === "string") : [],
    venue: str(o.venue),
    year: num(o.year),
    doi: str(o.doi),
    type: str(o.type) || "article",
    isOa: Boolean(o.isOa),
    citedByCount: num(o.citedByCount) ?? 0,
    topic: str(o.topic),
    ...optionalBiblio(biblioFrom(o.biblio, storedString)),
  };
}

const clip = (s: unknown, max: number) => (typeof s === "string" ? s.slice(0, max) : "");

/**
 * Ne garde que les champs attendus, bornés et nettoyés (caractères de contrôle et bidi retirés) : ce qui arrive du
 * client n'est jamais stocké tel quel. Les routes d'ajout reconstruisent en plus l'instantané depuis OpenAlex
 * (`verifiedSnapshot`) : seul l'identifiant du client compte.
 */
export function sanitizeSnapshot(input: unknown): FavoriteSnapshot | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const id = clip(o.id, 32);
  if (!WORK_ID.test(id)) return null;
  const title = cleanText(o.title, 500);
  if (!title) return null;
  return {
    id,
    title,
    authors: cleanText(o.authors, 300),
    authorNames: Array.isArray(o.authorNames) ? o.authorNames.map((n) => cleanText(n, 120)).filter(Boolean).slice(0, MAX_SNAPSHOT_AUTHORS) : [],
    venue: cleanText(o.venue, 300) || null,
    year: typeof o.year === "number" && Number.isFinite(o.year) ? Math.trunc(o.year) : null,
    doi: typeof o.doi === "string" && o.doi.length <= 300 && DOI_URL.test(o.doi) ? o.doi : null,
    type: cleanText(o.type, 40) || "article",
    isOa: Boolean(o.isOa),
    citedByCount: typeof o.citedByCount === "number" && Number.isFinite(o.citedByCount) ? Math.max(0, Math.trunc(o.citedByCount)) : 0,
    topic: cleanText(o.topic, 200) || null,
    // Facultatif : les favoris stockés avant ce champ n'en ont pas et restent citables sans lui.
    ...optionalBiblio(biblioFrom(o.biblio, shortText)),
  };
}

/**
 * Place d'un favori retiré (NEW-8), renvoyée par son retrait et rendue par « Annuler » : sa date d'ajout, son rang dans
 * l'index `favoriteIds` et son rang dans chaque liste qui le contenait. Sans elle, le favori rétabli prendrait la date
 * du jour (tête de « Mes favoris ») et la dernière place de ses listes, dont l'ordre est manuel (page publique d'une
 * liste partagée, export BibTeX).
 */
export interface FavoritePlacement {
  /** Date d'ajout d'origine, ISO 8601 ; `null` : inconnue, le serveur pose la date du jour. */
  addedAt: string | null;
  /** Rang dans `favoriteIds` (ordre d'ajout) ; `null` : en dernier. */
  index: number | null;
  /** Rang de l'article dans chacune des listes qui le contenaient. */
  lists: { id: string; index: number }[];
}

/** Première date qu'un Timestamp Firestore accepte (0001-01-01) : avant, `Timestamp.fromDate` lève une exception. */
const MIN_ADDED_AT = -62_135_596_800_000;
const rank = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < MAX_FAVORITES ? v : null);

/**
 * Placement reçu du client, relu champ par champ : date valide ramenée au plus tard à `now`, et pas avant le 0001-01-01
 * que Firestore accepte (sinon `null`), rangs
 * entiers bornés, listes au plus `MAX_COLLECTIONS`, identifiants de document valides et sans doublon. `null` : forme
 * inutilisable (la route répond 400). Rien de plus à vérifier : il ne place que les propres données de l'utilisateur.
 */
export function sanitizePlacement(input: unknown, now = Date.now()): FavoritePlacement | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if (!Array.isArray(o.lists) || o.lists.length > MAX_COLLECTIONS) return null;
  const lists: FavoritePlacement["lists"] = [];
  for (const l of o.lists as unknown[]) {
    const id = l && typeof l === "object" ? (l as Record<string, unknown>).id : undefined;
    const index = l && typeof l === "object" ? rank((l as Record<string, unknown>).index) : null;
    if (typeof id !== "string" || !DOC_ID.test(id) || index === null) return null;
    if (!lists.some((x) => x.id === id)) lists.push({ id, index });
  }
  const at = typeof o.addedAt === "string" ? Date.parse(o.addedAt) : NaN;
  const valid = Number.isFinite(at) && at >= MIN_ADDED_AT;
  return { addedAt: valid ? new Date(Math.min(at, now)).toISOString() : null, index: rank(o.index), lists };
}

/** Copie du tableau avec `item` inséré à `index`, ramené dans les bornes (au-delà : en dernier). */
export function insertAt<T>(items: readonly T[], item: T, index: number | null): T[] {
  const next = [...items];
  next.splice(index === null ? next.length : Math.max(0, Math.min(index, next.length)), 0, item);
  return next;
}

/** Nom de fichier sûr à partir d'un nom de liste. */
export function fileSlug(name: string): string {
  return fold(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "liste";
}
