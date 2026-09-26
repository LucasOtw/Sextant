/**
 * Nettoyage des textes et adresses reçus (client, OpenAlex) avant stockage ou affichage, et pliage des accents pour les
 * recherches. Module neutre, sans dépendance : importable par tous les `*-shared` (favoris, surlignages, listes, retours)
 * sans import circulaire ni dépendance artificielle entre eux (QUAL-30). Partagé client / serveur.
 */

/**
 * Sort d'un caractère de contrôle (Cc) ou de mise en forme (Cf) dans `cleanText` :
 * - saut de ligne gardé (réduit ensuite, ou changé en espace sans `keepLines`) ;
 * - tabulations, saut de page et NEL changés en espace : un texte collé d'un tableur ne voit pas ses mots fusionner ;
 * - ZWNJ et ZWJ (U+200C, U+200D) gardés : écritures persane et indiennes, émojis composés (QUAL-32) ;
 * - étiquettes (U+E0020-U+E007F) gardées : elles composent les drapeaux de subdivision (Écosse, pays de Galles) ;
 * - tout le reste retiré, dont les contrôles bidirectionnels (U+202A-U+202E, U+2066-U+2069), U+200B et le BOM.
 */
function controlChar(c: string): string {
  const cp = c.codePointAt(0) ?? 0;
  if (c === "\n" || c === "\u200C" || c === "\u200D" || (cp >= 0xe0020 && cp <= 0xe007f)) return c;
  return c === "\t" || c === "\v" || c === "\f" || c === "\u0085" ? " " : "";
}

/** ZWNJ et ZWJ en bord de texte ou contre un blanc : ils ne joignent rien, on les retire. */
const LOOSE_JOINERS = /(^|\s)[\u200C\u200D]+|[\u200C\u200D]+(?=\s|$)/g;

/** Au moins un caractère visible : ni blanc, ni ZWNJ / ZWJ, ni étiquette. */
const VISIBLE = /[^\s\u200C\u200D\u{E0020}-\u{E007F}]/u;

/**
 * Texte normalisé : caractères de contrôle et de mise en forme retirés (cf. `controlChar`), espaces réduits (les sauts
 * de ligne sont gardés si `keepLines`), borné. Chaîne vide s'il ne reste rien de visible : un nom de liste, un titre de
 * retour ou un passage fait seulement de ZWJ passerait sinon les contrôles « non vide » (ZWJ gardés depuis QUAL-32).
 */
export function cleanText(input: unknown, max: number, keepLines = false): string {
  if (typeof input !== "string") return "";
  const flat = input
    .replace(/\r\n?/g, "\n")
    .replace(/[\p{Cc}\p{Cf}]/gu, controlChar)
    .replace(LOOSE_JOINERS, "$1")
    .replace(keepLines ? /[^\S\n]+/g : /\s+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // La troncature peut laisser un joignant en fin de texte : second passage.
  const out = Array.from(flat).slice(0, max).join("").replace(LOOSE_JOINERS, "$1").trim();
  return VISIBLE.test(out) ? out : "";
}

/** Le texte dépasse-t-il la borne (comptée en points de code) ? Sert à refuser plutôt que tronquer en silence. */
export function tooLong(input: unknown, max: number): boolean {
  return typeof input === "string" && Array.from(input).length > max;
}

/**
 * Lettres sans leurs accents (« É » → « E », « ü » → « u ») : décomposition NFD, puis retrait des diacritiques
 * combinants U+0300-U+036F. Forme échappée : la plage écrite en caractères littéraux serait invisible (QUAL-30).
 */
export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Minuscules sans accents : « Écologie » et « ecologie » se retrouvent (filtres des listes, thèmes, outils MCP). */
export function fold(s: string): string {
  return stripAccents(s).toLowerCase();
}

/**
 * Espaces insécables de la typographie française (Y14) : espace fine (U+202F) avant « ; ! ? », espace normale (U+00A0)
 * avant « : » et à l'intérieur des guillemets. Seules les espaces déjà présentes changent : un signe ou un guillemet ne se
 * retrouve plus seul en début ou en fin de ligne. Forme échappée : les caractères littéraux seraient invisibles.
 */
export function frSpaces(s: string): string {
  return s
    .replace(/ ([;!?])/g, "\u202F$1")
    .replace(/ :/g, "\u00A0:")
    .replace(/« /g, "«\u00A0")
    .replace(/ »/g, "\u00A0»");
}

/**
 * Adresse externe affichable en lien : http(s) seulement, sans identifiants (`https://user:pass@…`), sinon null.
 * Les adresses d'OpenAlex (PDF, pages d'éditeur, sites d'institution) sont moissonnées chez des milliers de sources :
 * React bloque `javascript:`, mais pas `data:`, `blob:` ni les autres schémas (SEC-16).
 */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  return u.href;
}
