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
/** Identifiant OpenAlex d'un article (W + chiffres), borné. */
export const WORK_ID = /^W\d{1,31}$/;

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
  if (!WORK_ID.test(id)) return null;
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

const PARTICLES = new Set(["van", "von", "der", "den", "de", "del", "della", "di", "da", "le", "la", "du", "dos", "das", "ter", "ten", "af", "av", "zu", "y", "e", "d'", "l'"]);

/** « María del Carmen García López » → nom « García López » ? non : OpenAlex ne structure pas ; on garde le dernier mot et ses particules (« van der Berg »), initiales avec trait d'union (« J.-P. »). */
export function splitAuthorName(full: string): { last: string; initials: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { last: "", initials: "" };
  const lastParts = [parts.pop()!];
  while (parts.length > 1 && PARTICLES.has(parts[parts.length - 1].toLowerCase())) lastParts.unshift(parts.pop()!);
  const initials = parts.map((p) => p.split("-").filter(Boolean).map((x) => x[0]!.toUpperCase() + ".").join("-")).join(" ");
  return { last: lastParts.join(" "), initials };
}

function bibKey(s: FavoriteSnapshot): string {
  const last = s.authorNames[0] ? splitAuthorName(s.authorNames[0]).last.replace(/\s+/g, "") : "anon";
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

function apaName(full: string): string {
  const { last, initials } = splitAuthorName(full);
  return initials ? `${last}, ${initials}` : last;
}

/** Référence APA (7e éd.) depuis un instantané : auteurs, année, titre, revue, DOI. */
export function apaFromSnapshot(s: FavoriteSnapshot): string {
  const names = s.authorNames.map(apaName);
  let authors = "Anonyme";
  if (names.length === 1) authors = names[0];
  else if (names.length > 1 && names.length <= 20) authors = `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}`;
  else if (names.length > 20) authors = `${names.slice(0, 19).join(", ")}, … ${names[names.length - 1]}`;
  const year = s.year ? `(${s.year})` : "(s. d.)";
  return `${authors} ${year}. ${s.title}.${s.venue ? ` ${s.venue}.` : ""}${s.doi ? ` ${s.doi}` : ""}`;
}

/** Appel de citation court : (Piwowar et al., 2018, p. 4). */
export function citeInline(s: FavoriteSnapshot, page?: number | null): string {
  const names = s.authorNames.map((n) => splitAuthorName(n).last).filter(Boolean);
  const who = names.length === 0 ? "Anonyme" : names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} & ${names[1]}` : `${names[0]} et al.`;
  return `(${who}, ${s.year ?? "s. d."}${page ? `, p. ${page}` : ""})`;
}

/** BibTeX de plusieurs références, clés rendues uniques (suffixe b, c, d… en cas de doublon). */
export function bibtexAll(items: FavoriteSnapshot[]): string {
  const used = new Map<string, number>();
  return items
    .map((f) => {
      const entry = bibtexFromSnapshot(f);
      const m = entry.match(/^@\w+\{([^,]+),/);
      if (!m) return entry;
      const n = used.get(m[1]) ?? 0;
      used.set(m[1], n + 1);
      return n === 0 ? entry : entry.replace(m[1], `${m[1]}${String.fromCharCode(97 + n)}`);
    })
    .join("\n\n");
}

/** Nom de fichier sûr à partir d'un nom de liste. */
export function fileSlug(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "liste";
}
