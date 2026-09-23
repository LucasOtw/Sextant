/**
 * Identité du site pour les pages légales. Les valeurs personnelles viennent des variables d'environnement
 * pour ne pas figer un nom ou une adresse dans le code public. Voir `.env.example`.
 */
export const SITE = {
  name: "Sextant",
  url: "https://sextant-psi.vercel.app",
  /** Personne physique qui édite le site et en est directeur de la publication. */
  publisherName: process.env.LEGAL_PUBLISHER_NAME?.trim() || null,
  /** Adresse de contact affichée sur le site (mentions légales, demandes RGPD). */
  contactEmail: process.env.LEGAL_CONTACT_EMAIL?.trim() || null,
  host: {
    name: "Vercel Inc.",
    address: "440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis",
    url: "https://vercel.com",
    contact: "privacy@vercel.com",
  },
} as const;
