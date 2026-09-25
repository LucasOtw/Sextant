/**
 * Requêtes partielles du lecteur PDF (PERF-06), partagées par le relais /api/pdf et le lecteur. Pur, sans import serveur.
 *
 * Le lecteur télécharge le PDF en entier comme avant, mais le confie à PDF.js au fil de l'eau : PDF.js demande alors par
 * plages ce qui lui manque pour afficher la première page (la table de fin de fichier, les objets de la page), sans
 * attendre la fin du téléchargement. Une plage n'est lue que chez la copie qui a servi le fichier entier (index de
 * candidat renvoyé par le relais), et vérifiée à l'arrivée (début, fin, taille totale) : jamais d'octets d'un autre
 * fichier mélangés au document. Une plage refusée ou non conforme est simplement ignorée : le téléchargement complet,
 * qui continue, finit par apporter les mêmes octets.
 */

/** Plus grosse plage relayée (PDF.js demande des morceaux de 64 Ko, regroupés au besoin). */
export const MAX_RANGE_BYTES = 4 * 1024 * 1024;
/** En dessous, le fichier entier arrive assez vite : pas de requêtes partielles (chacune coûte une invocation). */
export const RANGE_MIN_TOTAL_BYTES = 2 * 1024 * 1024;

/** `bytes=a-b` : un seul intervalle fermé, borné à MAX_RANGE_BYTES. Rien d'autre (suffixe, intervalles multiples). */
export function parseRange(header: string | null): { start: number; end: number } | null {
  const m = /^bytes=(\d{1,12})-(\d{1,12})$/.exec(header?.trim() ?? "");
  if (!m) return null;
  const start = Number(m[1]);
  const end = Number(m[2]);
  if (end < start || end - start + 1 > MAX_RANGE_BYTES) return null;
  return { start, end };
}

/** `bytes a-b/total` (taille totale connue), cohérent ; sinon null. */
export function parseContentRange(header: string | null): { start: number; end: number; total: number } | null {
  const m = /^bytes (\d{1,12})-(\d{1,12})\/(\d{1,12})$/.exec(header?.trim() ?? "");
  if (!m) return null;
  const [start, end, total] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (end < start || end >= total) return null;
  return { start, end, total };
}

/**
 * La réponse de l'hébergeur à `bytes=start-end` est-elle exactement la plage voulue ? Elle peut s'arrêter avant `end`
 * seulement à la fin du fichier.
 */
export function isExpectedRange(cr: { start: number; end: number; total: number } | null, start: number, end: number): boolean {
  if (!cr || cr.start !== start) return false;
  return cr.end === end || (cr.end < end && cr.end === cr.total - 1);
}
