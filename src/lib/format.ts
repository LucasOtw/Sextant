import type { Work } from "./openalex";
import { safeHttpUrl } from "./text";
import { CALENDAR_DATE_LONG } from "./dates";

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

/** URL vers le PDF ou la version en accès ouvert, si elle existe (http(s) seulement, voir safeHttpUrl). */
export function openAccessUrl(w: Work): { url: string; isPdf: boolean } | null {
  const pdf = safeHttpUrl(w.best_oa_location?.pdf_url) ?? safeHttpUrl(w.primary_location?.pdf_url);
  if (pdf) return { url: pdf, isPdf: true };
  const oa = safeHttpUrl(w.open_access.oa_url) ?? safeHttpUrl(w.best_oa_location?.landing_page_url);
  if (w.open_access.is_oa && oa) return { url: oa, isPdf: false };
  return null;
}

/**
 * Adresse que le lecteur peut embarquer quand le relais échoue (repli `<object>`) : un PDF en accès ouvert en https,
 * passé par la garde du relais (isPublicPdfUrl). Jamais une adresse en http (contenu mixte, cadre vide), sur un hôte
 * privé ou une IP littérale : sans elle, le lecteur ne propose que le lien vers l'original (SEC-16).
 */
export function embeddablePdfUrl(w: Work): string | null {
  return openAccessPdfUrls(w).find((u) => u.startsWith("https:")) ?? null;
}

/**
 * Une adresse de PDF relayable : http(s) public, sans IP littérale, sans hôte local ni port exotique.
 * Les adresses viennent d'OpenAlex (moissonnées chez des milliers de dépôts) : on ne relaie jamais vers l'intérieur.
 * Premier filtre, sur l'adresse seule : un nom public qui résout vers une adresse privée (DNS joker du type
 * `127.0.0.1.nip.io`) ne se voit pas ici. Le relais contrôle aussi les adresses résolues et chaque redirection
 * (src/lib/public-fetch.ts).
 */
export function isPublicPdfUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (u.port && u.port !== "80" && u.port !== "443") return false;
  // Point final retiré : « localhost. » et « metadata.google.internal. » désignent les mêmes hôtes que sans le point.
  const h = u.hostname.toLowerCase().replace(/\.+$/, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".arpa")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.startsWith("[") || h.includes(":")) return false;
  return h.includes(".");
}

/** Adresses de PDF en accès ouvert, la meilleure d'abord puis les dépôts (PMC, arXiv, HAL…) : plusieurs chances pour le lecteur. */
export function openAccessPdfUrls(w: Work): string[] {
  if (!w.open_access.is_oa) return [];
  const urls = [w.best_oa_location?.pdf_url, w.primary_location?.pdf_url, ...(w.locations ?? []).filter((l) => l.is_oa).map((l) => l.pdf_url)];
  return [...new Set(urls.filter((u): u is string => Boolean(u) && isPublicPdfUrl(u!)))];
}

/**
 * Le lecteur intégré (/article/[id]/lire) peut-il ouvrir l'article ? Il faut que le meilleur lien libre soit un PDF, et
 * qu'au moins une adresse de PDF soit relayable par /api/pdf. Même règle pour le bouton « Lire » de la fiche, la
 * surlignage dans le PDF et la redirection du lecteur (QUAL-39).
 */
export function canReadInline(w: Work): boolean {
  return Boolean(openAccessUrl(w)?.isPdf) && openAccessPdfUrls(w).length > 0;
}

export function publisherUrl(w: Work): string | null {
  return safeHttpUrl(w.doi) ?? safeHttpUrl(w.primary_location?.landing_page_url);
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

const INTEGER = new Intl.NumberFormat("fr-FR");
const COMPACT = new Intl.NumberFormat("fr-FR", { notation: "compact" });

/** Nombre entier à la française (« 12 345 ») : totaux de résultats, pagination. */
export function formatInteger(n: number): string {
  return INTEGER.format(n);
}

/** Compteur court : « 9 876 », puis « 12 k » à partir de 10 000. */
export function formatCount(n: number): string {
  return (n >= 10_000 ? COMPACT : INTEGER).format(n);
}

/** Date de publication d'OpenAlex (« 2024-03-15 ») en toutes lettres, au jour exact quel que soit le fuseau (QUAL-30). */
export function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return CALENDAR_DATE_LONG.format(d);
}

/** Initiales d'un compte pour l'avatar de repli : « Ada Lovelace » → « AL », « ada@exemple.fr » → « AE ». */
export function initialsOf(user: { name?: string | null; email?: string | null }): string {
  return (user.name ?? user.email ?? "?").split(/[\s@]+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

/** Tronque un texte à N mots. */
export function truncateWords(text: string, n: number): string {
  const words = text.split(/\s+/);
  if (words.length <= n) return text;
  return words.slice(0, n).join(" ") + "…";
}

/**
 * Texte ramené à `max` caractères au plus pour une balise `<meta name="description">` (QUAL-18) : espaces réduits,
 * coupé au dernier espace avant la limite, suivi de « … » (compris dans les `max`). Un mot unique trop long est coupé net.
 */
export function metaDescription(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const chars = Array.from(flat);
  if (chars.length <= max) return flat;
  const head = chars.slice(0, max - 1).join("");
  const cut = head.lastIndexOf(" ");
  return `${(cut > 0 ? head.slice(0, cut) : head).replace(/[\s,;:.–—-]+$/, "")}…`;
}

const META_KINDS = new Set(["article", "review", "preprint", "book", "book-chapter", "dissertation", "report", "dataset"]);

/**
 * Description d'une fiche article : le début du résumé, ou à défaut (pas de résumé dans OpenAlex) une notice
 * « Article de A, B et C. Revue, 2024. » pour que la page n'hérite pas de la description du site.
 */
export function articleMetaDescription(w: Work, abstract: string | null): string {
  if (abstract?.trim()) return metaDescription(abstract);
  const venue = venueName(w);
  // « Thèse de … », « Préprint de … » ; « Publication de … » pour les types qui ne se lisent pas ainsi (conférence, autre).
  let text = META_KINDS.has(w.type) ? typeLabel(w.type) : "Publication";
  if (authorNames(w).length > 0) text += ` de ${formatAuthors(w, 3)}`;
  // Revue et année à part (« Thèse de … . Revue, 2024. ») : pas de participe à accorder avec le type.
  const where = [venue, w.publication_year].filter(Boolean).join(", ");
  return metaDescription(where ? `${text}. ${where}.` : `${text}.`);
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "anglais", fr: "français", es: "espagnol", de: "allemand", it: "italien", pt: "portugais",
  nl: "néerlandais", ru: "russe", zh: "chinois", ja: "japonais", ko: "coréen", ar: "arabe", tr: "turc", pl: "polonais",
  ca: "catalan", cs: "tchèque", da: "danois", el: "grec", fa: "persan", fi: "finnois", he: "hébreu", hi: "hindi",
  hu: "hongrois", id: "indonésien", no: "norvégien", ro: "roumain", sv: "suédois", uk: "ukrainien", vi: "vietnamien",
};

/** "en" → "anglais" ; code inconnu renvoyé en majuscules. */
export function languageName(code: string): string {
  return LANGUAGE_NAMES[code.toLowerCase()] ?? code.toUpperCase();
}

/**
 * Attribut `lang` d'un passage dans la langue de l'article (WCAG 3.1.2) : les lecteurs d'écran changent alors de voix.
 * Code OpenAlex (ISO 639-1, détecté automatiquement) validé en balise de langue ; undefined s'il est absent, mal formé
 * ou français (le passage hérite alors du `fr` de la page).
 */
export function contentLang(code: string | null | undefined): string | undefined {
  const c = code?.trim().toLowerCase();
  return c && c !== "fr" && /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(c) ? c : undefined;
}

/** Langue du titre : celle de l'article, sauf quand le titre manque et que « Sans titre » (français) le remplace. */
export function titleLang(w: Pick<Work, "title" | "display_name" | "language">): string | undefined {
  return w.title || w.display_name ? contentLang(w.language) : undefined;
}
