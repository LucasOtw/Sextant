/**
 * Ré-authentification avant une opération sensible (SEC-09). Partagé client / serveur : aucun import serveur ici.
 * Le serveur répond 401 avec `code: REAUTH_REQUIRED` quand la dernière connexion Google date de plus de
 * `REAUTH_MAX_AGE_S` ; le client rouvre alors la fenêtre Google et rejoue la requête.
 */
export const REAUTH_REQUIRED = "reauth_required";
/** Ancienneté maximale de la connexion Google pour une opération sensible : 10 minutes. */
export const REAUTH_MAX_AGE_S = 10 * 60;
/** Refus d'une ré-authentification faite avec un autre compte Google que celui de la session. */
export const WRONG_ACCOUNT = "wrong_account";
