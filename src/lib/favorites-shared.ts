import type { Work } from "@/lib/openalex";
import { shortId } from "@/lib/openalex";
import type { CitationSource } from "@/lib/citation";
import { authorNames, formatAuthors, venueName, workTitle } from "@/lib/format";
import { cleanText } from "@/lib/text";

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
  const names = stored.authorNames;
  return Array.isArray(names) && names.length === s.authorNames.length && names.every((n, i) => n === s.authorNames[i]);
}

/** Même ensemble d'identifiants (ordre indifférent) : un rechargement sans changement ne re-rend rien (PERF-12). */
export function sameIdSet(current: ReadonlySet<string>, next: readonly string[]): boolean {
  if (current.size !== next.length) return false;
  return next.every((id) => current.has(id));
}
/** Identifiant OpenAlex d'un article (W + chiffres), borné. */
export const WORK_ID = /^W\d{1,31}$/;

/** Auteurs gardés au plus dans un instantané. */
const MAX_SNAPSHOT_AUTHORS = 50;

export function snapshotFromWork(work: Work): FavoriteSnapshot {
  const names = authorNames(work);
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
  };
}

/**
 * Source de citation d'un article OpenAlex (fiche, outil MCP get_article) : l'instantané, avec tous les auteurs (pas
 * seulement les 50 gardés en favori) et le volume, le numéro et les pages. Passe par le même module de citation que
 * les favoris : un article est cité de la même façon partout (QUAL-02).
 */
export function citationFromWork(work: Work): CitationSource {
  const b = work.biblio;
  const biblio = { volume: b?.volume ?? null, issue: b?.issue ?? null, firstPage: b?.first_page ?? null, lastPage: b?.last_page ?? null };
  return { ...snapshotFromWork(work), authorNames: authorNames(work), biblio };
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
    doi: typeof o.doi === "string" && /^https?:\/\/doi\.org\//.test(o.doi) ? o.doi.slice(0, 300) : null,
    type: cleanText(o.type, 40) || "article",
    isOa: Boolean(o.isOa),
    citedByCount: typeof o.citedByCount === "number" && Number.isFinite(o.citedByCount) ? Math.max(0, Math.trunc(o.citedByCount)) : 0,
    topic: cleanText(o.topic, 200) || null,
  };
}

/** Nom de fichier sûr à partir d'un nom de liste. */
export function fileSlug(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "liste";
}
