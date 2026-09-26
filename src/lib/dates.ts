/**
 * Formats de date de l'interface, en français, créés une fois par module (QUAL-30). Un horodatage (création d'un
 * favori, d'une note, d'une clé…) s'affiche à l'heure de Paris : le rendu serveur se fait en UTC, et sans fuseau une
 * inscription faite entre minuit et 2 h s'afficherait la veille. Partagé client / serveur, sans dépendance.
 */
const PARIS = "Europe/Paris";

/** « 3 mars 2025 » (mois abrégé) : listes de favoris, citations, retours, clés MCP. */
export const DATE_SHORT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: PARIS });

/** « 3 mars 2025, 14:05 » : dernière modification d'une note. */
export const DATE_TIME = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: PARIS });

/** « 3 mars 2025 » (mois en toutes lettres) : « membre depuis le … » sur /compte. */
export const DATE_LONG = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: PARIS });

/**
 * Date seule du calendrier (« AAAA-MM-JJ » d'OpenAlex), que `new Date` lit comme minuit UTC : affichée en UTC, elle
 * garde son jour quel que soit le fuseau de la machine qui la formate (serveur, ou navigateur hors d'Europe).
 */
export const CALENDAR_DATE_LONG = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
