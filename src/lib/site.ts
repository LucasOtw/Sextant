/**
 * Identité du site pour les pages légales. Les valeurs personnelles viennent des variables d'environnement
 * pour ne pas figer un nom ou une adresse dans le code public. Voir `.env.example`.
 */
/**
 * Nom de l'éditeur tel que configuré, ou null s'il est vide ou laissé à la valeur d'exemple (« Prénom Nom ») : la page
 * affiche alors « [à compléter] » au lieu de désigner un éditeur fictif.
 */
export function legalPublisherName(raw: string | undefined): string | null {
  const name = raw?.trim();
  return name && !/^pr[ée]nom\s+nom$/i.test(name) ? name : null;
}

/**
 * Adresse de contact telle que configurée, ou null si elle est vide, mal formée ou d'exemple (exemple.fr, example.com,
 * .test…) : sans elle, les liens « Signaler » mènent à la procédure des mentions légales au lieu d'écrire, avec les
 * coordonnées du signalant, à un domaine qui n'est pas celui de l'éditeur.
 */
export function legalContactEmail(raw: string | undefined): string | null {
  const email = raw?.trim();
  if (!email || !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)) return null;
  return /@(?:[^@]+\.)?(?:exemple|example)\.(?:fr|com|org|net)$|\.(?:test|example|invalid|localhost)$/i.test(email) ? null : email;
}

/**
 * Identité légale manquante, signalée au build de production (next.config.ts) : les pages légales sont prérendues,
 * un déploiement sans éditeur ni adresse réels publie « [à compléter] » et des liens « Signaler » vers la procédure.
 */
export function missingLegalIdentity(env: Record<string, string | undefined>): string[] {
  const missing: string[] = [];
  if (!legalPublisherName(env.LEGAL_PUBLISHER_NAME)) missing.push("LEGAL_PUBLISHER_NAME");
  if (!legalContactEmail(env.LEGAL_CONTACT_EMAIL)) missing.push("LEGAL_CONTACT_EMAIL");
  return missing;
}

export const SITE = {
  name: "Sextant",
  url: "https://sextant.site",
  /** Personne physique qui édite le site et en est directeur de la publication. */
  publisherName: legalPublisherName(process.env.LEGAL_PUBLISHER_NAME),
  /** Adresse de contact affichée sur le site (mentions légales, demandes RGPD). */
  contactEmail: legalContactEmail(process.env.LEGAL_CONTACT_EMAIL),
  /**
   * Licence du code source (identifiant SPDX, ex. "AGPL-3.0-only" ou "MIT"), à renseigner avec le fichier LICENSE du
   * dépôt (NEW-13). Décision de l'éditeur : tant qu'elle vaut null, les mentions légales disent qu'aucune licence n'est
   * attachée au code.
   */
  codeLicense: null as string | null,
  host: {
    name: "Vercel Inc.",
    address: "440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis",
    url: "https://vercel.com",
    contact: "privacy@vercel.com",
  },
} as const;
