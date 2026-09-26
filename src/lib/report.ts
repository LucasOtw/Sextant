/**
 * Signalement d'un contenu publié par un utilisateur (DSA art. 16, SEC-13) : sujets de « Bugs et idées » et listes
 * partagées. Pas de service dédié : un courriel prérempli vers l'adresse de contact des mentions légales, avec les
 * éléments qu'un signalement doit contenir (adresse exacte du contenu, motif, coordonnées, déclaration de bonne foi).
 * Sans adresse configurée, le lien mène à la section « Signaler un contenu » des mentions légales.
 */

/** Section des mentions légales qui décrit la procédure. */
export const REPORT_SECTION = "/mentions-legales#signaler";

export function reportBody(url: string): string {
  return [
    `Contenu signalé : ${url}`,
    "",
    "Motif (en quoi ce contenu est-il illicite ou contraire aux conditions d'utilisation ?) :",
    "",
    "",
    "Vos nom et adresse e-mail :",
    "",
    "",
    "Je déclare de bonne foi que les informations et allégations de ce signalement sont exactes et complètes.",
  ].join("\n");
}

/**
 * Lien « Signaler » : `mailto:` prérempli (objet et corps encodés), ou la section des mentions légales à défaut
 * d'adresse. `what` nomme le contenu dans l'objet (« liste partagée », « sujet … »), `url` est son adresse absolue.
 */
export function reportHref(email: string | null, what: string, url: string): string {
  if (!email) return REPORT_SECTION;
  const subject = encodeURIComponent(`Signalement : ${what}`);
  return `mailto:${email}?subject=${subject}&body=${encodeURIComponent(reportBody(url))}`;
}
