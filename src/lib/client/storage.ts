/**
 * Stockage du navigateur (localStorage, sessionStorage) sans exception (QUAL-31). L'accès peut lever : navigation
 * privée de certains navigateurs, stockage désactivé ou plein, rendu serveur. Chaque fonction enveloppe son try/catch
 * une seule fois ; l'appelant choisit le repli (valeur absente, écriture ignorée). Ce qui est relu reste à valider :
 * le stockage est modifiable par le visiteur, une extension ou un ancien format.
 *
 * Sans dépendance : importable par un module partagé client / serveur (côté serveur, tout renvoie le repli).
 * Seule exception, le script d'avant l'affichage (lib/pre-hydration.ts), autonome par nature.
 */
type Area = "local" | "session";

function storage(area: Area): Storage {
  return area === "session" ? sessionStorage : localStorage;
}

/** Valeur enregistrée, ou null (clé absente, stockage indisponible). */
export function readStored(key: string, area: Area = "local"): string | null {
  try {
    return storage(area).getItem(key);
  } catch {
    return null;
  }
}

/**
 * Drapeau enregistré (valeur non vide) ? true ou false, ou null si le stockage est illisible : un message « une seule
 * fois par navigateur » ne s'affiche alors pas du tout, plutôt qu'à chaque page faute de pouvoir noter qu'il a été vu.
 */
export function hasStored(key: string, area: Area = "local"): boolean | null {
  try {
    return Boolean(storage(area).getItem(key));
  } catch {
    return null;
  }
}

/** Enregistre la valeur ; sans effet si le stockage est indisponible ou plein. */
export function writeStored(key: string, value: string, area: Area = "local"): void {
  try {
    storage(area).setItem(key, value);
  } catch {
    /* stockage indisponible ou plein : sans effet */
  }
}

/** Efface la clé ; sans effet si le stockage est indisponible. */
export function removeStored(key: string, area: Area = "local"): void {
  try {
    storage(area).removeItem(key);
  } catch {
    /* stockage indisponible */
  }
}

/** Valeur JSON relue, non validée (à l'appelant de la vérifier), ou null : clé absente, stockage indisponible, JSON illisible. */
export function readStoredJson(key: string, area: Area = "local"): unknown {
  const raw = readStored(key, area);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
