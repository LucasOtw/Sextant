/**
 * Nettoyage des textes et adresses reçus (client, OpenAlex) avant stockage ou affichage. Module neutre, sans dépendance : importable par
 * favorites-shared comme par highlights-shared sans import circulaire. Partagé client / serveur.
 */

/** Texte normalisé : caractères de contrôle et de mise en forme (bidi, U+202E…) retirés, espaces réduits (les sauts de ligne sont gardés si `keepLines`), borné. */
export function cleanText(input: unknown, max: number, keepLines = false): string {
  if (typeof input !== "string") return "";
  const flat = input.replace(/\r\n?/g, "\n").replace(/[\p{Cc}\p{Cf}]/gu, (c) => (c === "\n" ? "\n" : "")).replace(keepLines ? /[^\S\n]+/g : /\s+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return Array.from(flat).slice(0, max).join("").trim();
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
