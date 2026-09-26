/**
 * Identifiants, communs au client et au serveur : aucune dépendance, pour que les composants client l'importent sans
 * tirer le client OpenAlex (lib/openalex.ts, serveur seulement) dans le JavaScript des pages (QUAL-15).
 *
 * Une seule forme par type d'identifiant (QUAL-14), au lieu d'une regex par route : les identifiants OpenAlex réels ont
 * une dizaine de chiffres ; au-delà de 15, OpenAlex ne répond qu'après 10 à 20 s (504 et relance) au lieu d'un 404
 * immédiat. Formes en majuscules : une saisie en minuscules passe par `normalizeId`.
 */

/** Article OpenAlex (« W2741809807 »), tel que stocké et accepté par les routes. */
export const WORK_ID = /^W\d{1,15}$/;
/** Article dans un lot OpenAlex (`ids.openalex:A|B`) : au moins 2 chiffres, sinon OpenAlex refuse tout le lot (« W1 »). */
export const BATCH_WORK_ID = /^W\d{2,15}$/;
/** Auteur, institution et sujet OpenAlex. */
export const AUTHOR_ID = /^A\d{1,15}$/;
export const INSTITUTION_ID = /^I\d{1,15}$/;
export const TOPIC_ID = /^T\d{1,15}$/;
/** Document Firestore créé par le serveur (liste, surlignage) : identifiant automatique, jamais un chemin. */
export const DOC_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** L'identifiant sans espaces autour et en majuscules s'il a la forme attendue, sinon null. */
export function normalizeId(raw: string | null | undefined, re: RegExp): string | null {
  const id = raw?.trim().toUpperCase();
  return id && re.test(id) ? id : null;
}

/** Identifiant d'article normalisé (« w123 » → « W123 »), ou null s'il est mal formé. */
export function normalizeWorkId(raw: string | null | undefined): string | null {
  return normalizeId(raw, WORK_ID);
}

/** "https://openalex.org/W123" → "W123" */
export function shortId(id: string): string {
  return id.replace(/^https?:\/\/openalex\.org\//, "");
}

/** "https://doi.org/10.1000/xyz" → "10.1000/xyz" (le DOI nu, pour l'affichage, une recherche ou une citation). */
export function doiPath(doi: string): string {
  return doi.replace(/^https?:\/\/doi\.org\//i, "");
}
