/**
 * Pages où aucune fenêtre ne s'ouvre d'elle-même (accueil de première visite, annonces) : le lecteur et la liste
 * partagée, où l'on arrive par un lien pour lire, et les pages légales (A11Y-07). Le message d'accueil attend la page
 * suivante.
 */
const QUIET_ROUTES = /^\/(liste\/|article\/[^/]+\/lire(\/|$)|(conditions|confidentialite|mentions-legales)(\/|$))/;

export function isQuietRoute(pathname: string): boolean {
  return QUIET_ROUTES.test(pathname);
}
