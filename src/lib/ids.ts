/**
 * Identifiants OpenAlex, communs au client et au serveur : aucune dépendance, pour que les composants client
 * l'importent sans tirer le client OpenAlex (lib/openalex.ts, serveur seulement) dans le JavaScript des pages (QUAL-15).
 */

/** "https://openalex.org/W123" → "W123" */
export function shortId(id: string): string {
  return id.replace(/^https?:\/\/openalex\.org\//, "");
}
