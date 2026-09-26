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
 * - tout le reste retiré, dont les contrôles bidirectionnels (U+202A-U+202E, U+2066-U+2069), U+200B et le BOM.
 */
function controlChar(c: string): string {
  if (c === "\n" || c === "\u200C" || c === "\u200D") return c;
  return c === "\t" || c === "\v" || c === "\f" || c === "\u0085" ? " " : "";
}

/** Texte normalisé : caractères de contrôle et de mise en forme retirés (cf. `controlChar`), espaces réduits (les sauts de ligne sont gardés si `keepLines`), borné. */
export function cleanText(input: unknown, max: number, keepLines = false): string {
  if (typeof input !== "string") return "";
  const flat = input.replace(/\r\n?/g, "\n").replace(/[\p{Cc}\p{Cf}]/gu, controlChar).replace(keepLines ? /[^\S\n]+/g : /\s+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return Array.from(flat).slice(0, max).join("").trim();
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
