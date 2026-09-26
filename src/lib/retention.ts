/**
 * Durées de conservation des comptes inactifs et des clés d'assistant IA inutilisées (NEW-14). C'est une décision de
 * l'éditeur : tant qu'une durée vaut `null`, rien n'est effacé automatiquement, et la politique de confidentialité s'en
 * tient à « tant que le compte existe ». La politique et la purge (src/app/api/cron/retention/route.ts) lisent cette
 * même constante, mais la purge ne tourne que si deux réglages de déploiement sont aussi en place : `CRON_SECRET`
 * défini dans Vercel, et la tâche déclarée dans vercel.json (`crons`). Une durée renseignée sans eux ferait promettre
 * à la politique une suppression qui n'a jamais lieu. Ordre à suivre (note docs/handoffs/2026-09-26-lot-9-conformite.md) :
 * `CRON_SECRET`, essai à blanc avec les durées candidates en paramètre (`?dryRun=1&accountMonths=…&keyMonths=…`),
 * puis un seul commit qui renseigne les durées ici ET déclare la tâche dans vercel.json.
 */
export interface Retention {
  /** Compte supprimé, avec toutes ses données, après ce nombre de mois sans connexion Google ni usage d'une de ses clés. */
  inactiveAccountMonths: number | null;
  /** Clé d'assistant IA supprimée après ce nombre de mois sans usage (depuis sa création si elle n'a jamais servi). */
  unusedKeyMonths: number | null;
}

export const RETENTION: Retention = { inactiveAccountMonths: null, unusedKeyMonths: null };

/** Durée valide : nombre entier de mois, au moins 1. Toute autre valeur désactive la purge (échec prudent). */
export function validMonths(months: number | null): number | null {
  return typeof months === "number" && Number.isInteger(months) && months >= 1 ? months : null;
}

/** Instant situé `months` mois civils avant `now` (en millisecondes). */
export function monthsBefore(now: number, months: number): number {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.getTime();
}

/** Dernière activité connue (ms) parmi des dates éventuellement absentes ou illisibles ; 0 si aucune n'est connue. */
export function lastActivity(...times: (number | null | undefined)[]): number {
  return times.reduce<number>((max, t) => (typeof t === "number" && Number.isFinite(t) && t > max ? t : max), 0);
}

/**
 * Clé inutilisée depuis `cutoff` : dernier usage, ou création si elle n'a jamais servi, antérieur à cette date.
 * Sans aucune date connue, la clé est gardée : on n'efface jamais sur une donnée manquante.
 */
export function isKeyUnused(key: { createdAt: number | null; lastUsedAt: number | null }, cutoff: number): boolean {
  const last = lastActivity(key.lastUsedAt, key.createdAt);
  return last > 0 && last < cutoff;
}

/** Durée lisible pour la politique de confidentialité : « 12 mois », « 3 ans », « 18 mois ». */
export function retentionLabel(months: number): string {
  if (months % 12 === 0) return months === 12 ? "1 an" : `${months / 12} ans`;
  return `${months} mois`;
}
