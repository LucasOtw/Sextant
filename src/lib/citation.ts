/**
 * Références bibliographiques (APA 7, BibTeX, appel de citation court) : un seul module pour tous les écrans (QUAL-02).
 * La fiche article, les favoris, les listes (privées et partagées), les citations surlignées et les outils MCP citent
 * donc un même article de la même façon. Module pur, qui n'importe que lib/ids et lib/text (sans dépendance) : utilisable
 * côté client comme côté serveur, et hors de tout cycle (format.ts et favorites-shared.ts en dépendent, jamais l'inverse).
 */

import { doiPath } from "@/lib/ids";
import { stripAccents } from "@/lib/text";

/** Volume, numéro et pages d'une publication (OpenAlex `biblio`) ; les quatre clés sont toujours présentes. */
export interface Biblio {
  volume: string | null;
  issue: string | null;
  firstPage: string | null;
  lastPage: string | null;
}

/** Ce qu'il faut pour citer un article : un instantané de favori (FavoriteSnapshot) convient tel quel. */
export interface CitationSource {
  id: string;
  title: string;
  authorNames: string[];
  venue: string | null;
  year: number | null;
  doi: string | null;
  type: string;
  biblio?: Biblio | null;
}

/** Mention ajoutée aux références d'un article rétracté : on peut le citer, jamais sans le savoir. */
export const RETRACTED_APA_SUFFIX = " [Article rétracté]";
const RETRACTED_BIBTEX_NOTE = "Retracted";

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

/** Lettres latines sans accent (« É » → « E », « ü » → « u »), chiffres ; tout le reste est retiré. */
function ascii(s: string): string {
  return stripAccents(s).replace(/[^A-Za-z0-9]/g, "");
}

/**
 * Clé BibTeX : nom du premier auteur (particules comprises), année, premier mot de plus de trois lettres du titre
 * (« vanderberg2021deep »). Les accents sont translittérés avant le filtrage (QUAL-08) : « Étude » donne « etude ».
 * Jamais vide : un auteur et un titre sans aucune lettre latine (chinois, cyrillique…) donnent l'année et
 * l'identifiant OpenAlex (« 2020w123 »).
 */
export function bibKey(s: Pick<CitationSource, "id" | "title" | "authorNames" | "year">): string {
  const first = s.authorNames[0];
  const last = first ? ascii(splitAuthorName(first).last) : "anon";
  const word = s.title.split(/\s+/).map(ascii).find((w) => w.length > 3);
  const key = last || word ? `${last}${s.year ?? ""}${word ?? "work"}` : `${s.year ?? ""}${ascii(s.id)}`;
  return key.toLowerCase();
}

/** Type d'entrée BibTeX et champ de provenance selon le type OpenAlex. */
function bibtexKind(type: string): { kind: string; venueField: string } {
  if (type === "book") return { kind: "book", venueField: "publisher" };
  if (type === "dissertation") return { kind: "phdthesis", venueField: "school" };
  if (type === "conference-paper") return { kind: "inproceedings", venueField: "booktitle" };
  return { kind: "article", venueField: "journal" };
}

/**
 * Dernière page d'une pagination, ou null quand elle répète la première : les revues à numéro d'article (PeerJ, PLOS,
 * eLife) donnent `first_page` == `last_page` (« e4375 »), qu'on ne cite pas en intervalle « e4375–e4375 ».
 */
function lastPageOf(b: Biblio | null | undefined): string | null {
  return b?.lastPage && b.lastPage !== b.firstPage ? b.lastPage : null;
}

/**
 * Chemin d'un DOI pour le champ BibTeX `doi`, lu en verbatim par biblatex : on n'y échappe ni `_` ni `%`, mais on retire
 * accolades, antislashs et blancs, qu'un DOI valide ne contient jamais et qui fermeraient le champ au milieu (un
 * instantané client non vérifié pourrait sinon injecter des champs ou des commandes dans l'export d'une liste partagée).
 */
function bibDoi(doi: string): string {
  return doiPath(doi).replace(/[{}\\\s]/g, "");
}

function bibtexEntry(s: CitationSource, key: string, retracted: boolean): string {
  const { kind, venueField } = bibtexKind(s.type);
  const lines = [`@${kind}{${key},`, `  title = {${bibField(s.title)}},`];
  if (s.authorNames.length) lines.push(`  author = {${s.authorNames.map(bibField).join(" and ")}},`);
  if (s.year) lines.push(`  year = {${s.year}},`);
  if (s.venue) lines.push(`  ${venueField} = {${bibField(s.venue)}},`);
  const b = s.biblio;
  if (b?.volume) lines.push(`  volume = {${bibField(b.volume)}},`);
  if (b?.issue) lines.push(`  number = {${bibField(b.issue)}},`);
  const lastPage = lastPageOf(b);
  if (b?.firstPage) lines.push(`  pages = {${bibField(b.firstPage)}${lastPage ? `--${bibField(lastPage)}` : ""}},`);
  const doi = s.doi ? bibDoi(s.doi) : "";
  if (doi) lines.push(`  doi = {${doi}},`);
  if (retracted) lines.push(`  note = {${RETRACTED_BIBTEX_NOTE}},`);
  lines.push("}");
  return lines.join("\n");
}

/** Entrée BibTeX d'un article. `retracted` vient toujours d'une vérification serveur, jamais d'un instantané client. */
export function formatBibtex(s: CitationSource, retracted = false): string {
  return bibtexEntry(s, bibKey(s), retracted);
}

function apaName(full: string): string {
  const { last, initials } = splitAuthorName(full);
  return initials ? `${last}, ${initials}` : last;
}

/**
 * Référence APA (7e éd., approximative mais suffisante pour un copier-coller) : auteurs, année, titre, revue,
 * volume(numéro), pages, DOI. Au-delà de 20 auteurs : les 19 premiers, « … », puis le dernier.
 * `retracted` vient toujours d'une vérification serveur (getRetractedIds ou la notice OpenAlex), jamais de l'instantané.
 */
export function formatApa(s: CitationSource, retracted = false): string {
  const names = s.authorNames.map(apaName);
  let authors = "Anonyme";
  if (names.length === 1) authors = names[0];
  else if (names.length > 1 && names.length <= 20) authors = `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}`;
  else if (names.length > 20) authors = `${names.slice(0, 19).join(", ")}, … ${names[names.length - 1]}`;
  const year = s.year ? `(${s.year})` : "(s. d.)";
  const b = s.biblio;
  const vol = b?.volume ? `, ${b.volume}` : "";
  const issue = b?.issue ? `(${b.issue})` : "";
  const lastPage = lastPageOf(b);
  const pages = b?.firstPage ? `, ${b.firstPage}${lastPage ? `–${lastPage}` : ""}` : "";
  const venue = s.venue ? ` ${s.venue}${vol}${issue}${pages}.` : "";
  return `${authors} ${year}. ${s.title}.${venue}${s.doi ? ` ${s.doi}` : ""}${retracted ? RETRACTED_APA_SUFFIX : ""}`;
}

/** Appel de citation court : (Piwowar et al., 2018, p. 4). */
export function citeInline(s: Pick<CitationSource, "authorNames" | "year">, page?: number | null): string {
  const names = s.authorNames.map((n) => splitAuthorName(n).last).filter(Boolean);
  const who = names.length === 0 ? "Anonyme" : names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} & ${names[1]}` : `${names[0]} et al.`;
  return `(${who}, ${s.year ?? "s. d."}${page ? `, p. ${page}` : ""})`;
}

/** Suffixe de dédoublonnage : 1 → « b », 25 → « z », 26 → « aa »… sans limite (QUAL-08). */
function suffix(n: number): string {
  let out = "";
  for (let k = n + 1; k > 0; k = Math.floor((k - 1) / 26)) out = String.fromCharCode(97 + ((k - 1) % 26)) + out;
  return out;
}

/**
 * BibTeX de plusieurs références, clés rendues uniques (suffixe b, c, d… en cas de doublon, puis aa, ab…), sans jamais
 * reprendre une clé déjà émise. `retracted` : identifiants rétractés selon le serveur, marqués `note = {Retracted}`.
 */
export function bibtexAll(items: CitationSource[], retracted?: ReadonlySet<string>): string {
  const used = new Set<string>();
  return items
    .map((s) => {
      const base = bibKey(s);
      let key = base;
      for (let n = 1; used.has(key); n++) key = `${base}${suffix(n)}`;
      used.add(key);
      return bibtexEntry(s, key, retracted?.has(s.id) ?? false);
    })
    .join("\n\n");
}
