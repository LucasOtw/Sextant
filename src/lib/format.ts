import type { Work } from "./openalex";
import { bibField } from "./favorites-shared";

/** Reconstruit le texte d'un résumé depuis l'index inversé d'OpenAlex. */
export function abstractFromInvertedIndex(
  index: Record<string, number[]> | null | undefined,
): string | null {
  if (!index) return null;
  const positions: [number, string][] = [];
  for (const [word, idxs] of Object.entries(index)) {
    for (const i of idxs) positions.push([i, word]);
  }
  if (positions.length === 0) return null;
  positions.sort((a, b) => a[0] - b[0]);
  return positions.map(([, w]) => w).join(" ");
}

export function workTitle(w: Work): string {
  return w.title ?? w.display_name ?? "Sans titre";
}

export function authorNames(w: Work): string[] {
  return w.authorships.map((a) => a.author.display_name).filter(Boolean);
}

/** "A, B et C" / "A, B, C et 4 autres" */
export function formatAuthors(w: Work, max = 3): string {
  const names = authorNames(w);
  if (names.length === 0) return "Auteurs inconnus";
  if (names.length <= max) return joinFr(names);
  const rest = names.length - max;
  return `${names.slice(0, max).join(", ")} et ${rest} autre${rest > 1 ? "s" : ""}`;
}

function joinFr(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

export function venueName(w: Work): string | null {
  return w.primary_location?.source?.display_name ?? w.best_oa_location?.source?.display_name ?? null;
}

/** URL vers le PDF ou la version en accès ouvert, si elle existe. */
export function openAccessUrl(w: Work): { url: string; isPdf: boolean } | null {
  const pdf = w.best_oa_location?.pdf_url ?? w.primary_location?.pdf_url;
  if (pdf) return { url: pdf, isPdf: true };
  const oa = w.open_access.oa_url ?? w.best_oa_location?.landing_page_url;
  if (w.open_access.is_oa && oa) return { url: oa, isPdf: false };
  return null;
}

/** Adresses de PDF en accès ouvert, la meilleure d'abord puis les dépôts (PMC, arXiv, HAL…) : plusieurs chances pour le lecteur. */
export function openAccessPdfUrls(w: Work): string[] {
  if (!w.open_access.is_oa) return [];
  const urls = [w.best_oa_location?.pdf_url, w.primary_location?.pdf_url, ...(w.locations ?? []).filter((l) => l.is_oa).map((l) => l.pdf_url)];
  return [...new Set(urls.filter((u): u is string => Boolean(u) && /^https?:\/\//.test(u!)))];
}

export function publisherUrl(w: Work): string | null {
  return w.doi ?? w.primary_location?.landing_page_url ?? null;
}

const TYPE_LABELS: Record<string, string> = {
  article: "Article",
  review: "Revue de littérature",
  preprint: "Préprint",
  "book-chapter": "Chapitre",
  book: "Livre",
  "conference-paper": "Conférence",
  dissertation: "Thèse",
  dataset: "Jeu de données",
  report: "Rapport",
  editorial: "Éditorial",
  letter: "Lettre",
  erratum: "Erratum",
  other: "Autre",
};

export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

const OA_LABELS: Record<string, string> = {
  gold: "Accès ouvert (gold)",
  green: "Accès ouvert (green)",
  hybrid: "Accès ouvert (hybride)",
  bronze: "Accès ouvert (bronze)",
  diamond: "Accès ouvert (diamond)",
  closed: "Accès restreint",
};

export function oaLabel(status: string): string {
  return OA_LABELS[status] ?? status;
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat("fr-FR", { notation: n >= 10_000 ? "compact" : "standard" }).format(n);
}

export function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(d);
}

/** Tronque un texte à N mots. */
export function truncateWords(text: string, n: number): string {
  const words = text.split(/\s+/);
  if (words.length <= n) return text;
  return words.slice(0, n).join(" ") + "…";
}

function bibKey(w: Work): string {
  const first = w.authorships[0]?.author.display_name.split(" ").pop() ?? "anon";
  const word = workTitle(w).split(/\s+/).find((x) => x.length > 3) ?? "work";
  return `${first}${w.publication_year ?? ""}${word}`.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

export function toBibtex(w: Work): string {
  const kind = w.type === "book" ? "book" : w.type === "conference-paper" ? "inproceedings" : "article";
  const lines = [
    `@${kind}{${bibKey(w)},`,
    `  title = {${bibField(workTitle(w))}},`,
    `  author = {${authorNames(w).map(bibField).join(" and ")}},`,
  ];
  if (w.publication_year) lines.push(`  year = {${w.publication_year}},`);
  const venue = venueName(w);
  if (venue) lines.push(`  ${kind === "inproceedings" ? "booktitle" : "journal"} = {${bibField(venue)}},`);
  if (w.biblio?.volume) lines.push(`  volume = {${w.biblio.volume}},`);
  if (w.biblio?.issue) lines.push(`  number = {${w.biblio.issue}},`);
  if (w.biblio?.first_page) {
    lines.push(`  pages = {${w.biblio.first_page}${w.biblio.last_page ? `--${w.biblio.last_page}` : ""}},`);
  }
  if (w.doi) lines.push(`  doi = {${w.doi.replace(/^https?:\/\/doi\.org\//, "")}},`);
  lines.push("}");
  return lines.join("\n");
}

/** Citation au format APA 7 (approximatif, suffisant pour un copier-coller). */
export function toApa(w: Work): string {
  const names = w.authorships.map((a) => {
    const parts = a.author.display_name.trim().split(/\s+/);
    const last = parts.pop() ?? "";
    const initials = parts.map((p) => p[0]?.toUpperCase() + ".").join(" ");
    return initials ? `${last}, ${initials}` : last;
  });
  let authors = "";
  if (names.length === 0) authors = "Anonyme";
  else if (names.length === 1) authors = names[0];
  else if (names.length <= 20) authors = `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}`;
  else authors = `${names.slice(0, 19).join(", ")}, … ${names[names.length - 1]}`;

  const year = w.publication_year ? `(${w.publication_year})` : "(s. d.)";
  const venue = venueName(w);
  const vol = w.biblio?.volume ? `, ${w.biblio.volume}` : "";
  const issue = w.biblio?.issue ? `(${w.biblio.issue})` : "";
  const pages = w.biblio?.first_page
    ? `, ${w.biblio.first_page}${w.biblio.last_page ? `–${w.biblio.last_page}` : ""}`
    : "";
  const doi = w.doi ? ` ${w.doi}` : "";
  return `${authors} ${year}. ${workTitle(w)}.${venue ? ` ${venue}${vol}${issue}${pages}.` : ""}${doi}`;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "anglais", fr: "français", es: "espagnol", de: "allemand", it: "italien", pt: "portugais",
  nl: "néerlandais", ru: "russe", zh: "chinois", ja: "japonais", ko: "coréen", ar: "arabe", tr: "turc", pl: "polonais",
};

/** "en" → "anglais" ; code inconnu renvoyé en majuscules. */
export function languageName(code: string): string {
  return LANGUAGE_NAMES[code.toLowerCase()] ?? code.toUpperCase();
}
