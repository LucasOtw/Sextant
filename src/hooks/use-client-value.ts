import { useSyncExternalStore } from "react";

/** Aucun abonnement : la valeur ne change pas pendant la visite. */
const noSubscription = () => () => {};

/**
 * Valeur connue seulement du navigateur et fixe pendant la visite (API disponible, origine de la page) : `server` au
 * rendu serveur et à l'hydratation, puis `client()` (QUAL-31). Remplace le couple effet + setState, sans rendu en
 * cascade ni règle de lint désactivée. `client` doit renvoyer une valeur stable (booléen, chaîne).
 */
export function useClientValue<T>(client: () => T, server: T): T {
  return useSyncExternalStore(noSubscription, client, () => server);
}
