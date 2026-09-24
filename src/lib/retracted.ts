import "server-only";
import { logError, recover } from "@/lib/log";
import { getRetractedIds } from "@/lib/openalex";

/** Budget de la vérification des rétractations dans un rendu de page. */
const PAGE_BUDGET_MS = 2500;

/**
 * Rétractations parmi `ids`, bornées dans le temps pour les pages (favoris, listes partagées, citations) : ces pages ne
 * dépendent que de Firestore, et un badge ne doit pas les bloquer si OpenAlex est lent ou en panne (jusqu'à 8 s par
 * requête, davantage avec la relance). Au-delà du budget, la page s'affiche sans badge et le dépassement est journalisé.
 */
export async function retractedWithin(ids: string[], scope: string, ms = PAGE_BUDGET_MS): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<Set<string>>((resolve) => {
    timer = setTimeout(() => {
      logError(scope, new Error(`Vérification des rétractations hors délai (${ms} ms)`), { ids: ids.length });
      resolve(new Set());
    }, ms);
  });
  try {
    // Une panne après le délai reste journalisée par `recover`, sans effet sur la page déjà rendue.
    return await Promise.race([getRetractedIds(ids).catch(recover(scope, new Set<string>())), late]);
  } finally {
    clearTimeout(timer);
  }
}
