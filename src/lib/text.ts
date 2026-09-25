/**
 * Nettoyage des textes reçus (client, OpenAlex) avant stockage. Module neutre, sans dépendance : importable par
 * favorites-shared comme par highlights-shared sans import circulaire. Partagé client / serveur.
 */

/** Texte normalisé : caractères de contrôle et de mise en forme (bidi, U+202E…) retirés, espaces réduits (les sauts de ligne sont gardés si `keepLines`), borné. */
export function cleanText(input: unknown, max: number, keepLines = false): string {
  if (typeof input !== "string") return "";
  const flat = input.replace(/\r\n?/g, "\n").replace(/[\p{Cc}\p{Cf}]/gu, (c) => (c === "\n" ? "\n" : "")).replace(keepLines ? /[^\S\n]+/g : /\s+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return Array.from(flat).slice(0, max).join("").trim();
}
