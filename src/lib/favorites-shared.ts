import type { Work } from "@/lib/openalex";
import { shortId } from "@/lib/openalex";
import { authorNames, formatAuthors, venueName, workTitle } from "@/lib/format";

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

export function snapshotFromWork(work: Work): FavoriteSnapshot {
  return {
    id: shortId(work.id),
    title: workTitle(work),
    authors: formatAuthors(work, 3),
    authorNames: authorNames(work).slice(0, 50),
    venue: venueName(work),
    year: work.publication_year,
    doi: work.doi,
    type: work.type,
    isOa: work.open_access.is_oa,
    citedByCount: work.cited_by_count,
    topic: work.primary_topic?.display_name ?? null,
  };
}

const clip = (s: unknown, max: number) => (typeof s === "string" ? s.slice(0, max) : "");

/** Ne garde que les champs attendus, bornés : ce qui arrive du client n'est jamais stocké tel quel. */
export function sanitizeSnapshot(input: unknown): FavoriteSnapshot | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const id = clip(o.id, 32);
  if (!/^W\d+$/.test(id)) return null;
  const title = clip(o.title, 500);
  if (!title) return null;
  return {
    id,
    title,
    authors: clip(o.authors, 300),
    authorNames: Array.isArray(o.authorNames) ? o.authorNames.filter((n): n is string => typeof n === "string").map((n) => n.slice(0, 120)).slice(0, 50) : [],
    venue: o.venue ? clip(o.venue, 300) : null,
    year: typeof o.year === "number" && Number.isFinite(o.year) ? Math.trunc(o.year) : null,
    doi: typeof o.doi === "string" && /^https?:\/\/doi\.org\//.test(o.doi) ? o.doi.slice(0, 300) : null,
    type: clip(o.type, 40) || "article",
    isOa: Boolean(o.isOa),
    citedByCount: typeof o.citedByCount === "number" && Number.isFinite(o.citedByCount) ? Math.max(0, Math.trunc(o.citedByCount)) : 0,
    topic: o.topic ? clip(o.topic, 200) : null,
  };
}

/** Échappe un champ BibTeX : caractères spéciaux LaTeX et accolades déséquilibrées. */
export function bibField(value: string): string {
  let depth = 0;
  let out = "";
  for (const ch of value) {
    if (ch === "{") {
      depth++;
      out += ch;
    } else if (ch === "}") {
      if (depth === 0) continue; // accolade fermante orpheline
      depth--;
      out += ch;
    } else if (ch === "\\") {
      out += "\\textbackslash{}";
    } else if ("%&_$#".includes(ch)) {
      out += "\\" + ch;
    } else {
      out += ch;
    }
  }
  return out + "}".repeat(depth);
}

function bibKey(s: FavoriteSnapshot): string {
  const last = s.authorNames[0]?.split(" ").pop() ?? "anon";
  const word = s.title.split(/\s+/).find((w) => w.length > 3) ?? "work";
  return `${last}${s.year ?? ""}${word}`.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

/** BibTeX depuis un instantané (export de la liste des favoris). */
export function bibtexFromSnapshot(s: FavoriteSnapshot): string {
  const kind = s.type === "book" ? "book" : s.type === "dissertation" ? "phdthesis" : "article";
  const lines = [`@${kind}{${bibKey(s)},`, `  title = {${bibField(s.title)}},`];
  if (s.authorNames.length) lines.push(`  author = {${s.authorNames.map(bibField).join(" and ")}},`);
  if (s.year) lines.push(`  year = {${s.year}},`);
  if (s.venue) lines.push(`  ${kind === "book" ? "publisher" : kind === "phdthesis" ? "school" : "journal"} = {${bibField(s.venue)}},`);
  if (s.doi) lines.push(`  doi = {${s.doi.replace(/^https?:\/\/doi\.org\//, "")}},`);
  lines.push("}");
  return lines.join("\n");
}
