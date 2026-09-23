import { type FavoriteSnapshot, apaFromSnapshot, citeInline, sanitizeSnapshot } from "@/lib/favorites-shared";

/**
 * Surlignages : un passage retenu, rattaché à son article (`W…`), sa page, sa date et une note.
 * `prefix` / `suffix` = quelques caractères autour du passage, pour le retrouver dans le résumé même si le texte bouge.
 * L'article est dénormalisé (même instantané que les favoris) : la page « Mes citations » se rend sans appel OpenAlex.
 */
export type HighlightSource = "abstract" | "pdf" | "manual";

export interface HighlightInput {
  text: string;
  page: number | null;
  note: string;
  source: HighlightSource;
  prefix: string;
  suffix: string;
  article: FavoriteSnapshot;
}

export interface Highlight extends HighlightInput {
  id: string;
  workId: string;
  createdAt: string | null;
}

export const MAX_HIGHLIGHTS = 2000;
export const MAX_HIGHLIGHT_TEXT = 3000;
export const MAX_NOTE = 1000;
export const MAX_CONTEXT = 120;
export const MAX_PAGE = 100_000;

const SOURCES: HighlightSource[] = ["abstract", "pdf", "manual"];

/** Texte normalisé : caractères de contrôle retirés, espaces réduits. */
export function cleanText(input: unknown, max: number): string {
  if (typeof input !== "string") return "";
  return Array.from(input.replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim()).slice(0, max).join("").trim();
}

export function sanitizePage(input: unknown): number | null {
  if (typeof input !== "number" || !Number.isFinite(input)) return null;
  const n = Math.trunc(input);
  return n >= 1 && n <= MAX_PAGE ? n : null;
}

export function sanitizeHighlightInput(input: unknown): HighlightInput | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const article = sanitizeSnapshot(o.article);
  const text = cleanText(o.text, MAX_HIGHLIGHT_TEXT);
  if (!article || !text) return null;
  const source = SOURCES.includes(o.source as HighlightSource) ? (o.source as HighlightSource) : "manual";
  return {
    text,
    page: sanitizePage(o.page),
    note: cleanText(o.note, MAX_NOTE),
    source,
    prefix: cleanText(o.prefix, MAX_CONTEXT),
    suffix: cleanText(o.suffix, MAX_CONTEXT),
    article,
  };
}

export function sourceLabel(h: Pick<Highlight, "source" | "page">): string {
  const page = h.page ? ` · p. ${h.page}` : "";
  if (h.source === "abstract") return "Résumé";
  if (h.source === "pdf") return `PDF${page}`;
  return `Saisi à la main${page}`;
}

/** Le passage prêt à coller : citation entre guillemets, appel de citation, puis la référence complète. */
export function citationBlock(h: Highlight): string {
  return `« ${h.text} » ${citeInline(h.article, h.page)}\n\n${apaFromSnapshot(h.article)}`;
}
