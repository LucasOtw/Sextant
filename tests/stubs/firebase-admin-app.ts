/**
 * Remplace `firebase-admin/app` dans les tests unitaires (alias de vitest.config.mts) : aucune application Firebase
 * ne peut y être initialisée, que ce soit par @/lib/firebase/admin (déjà remplacé) ou par un module qui l'importerait
 * directement. Les imports de types et `firebase-admin/firestore` (FieldValue) ne sont pas concernés.
 */
function refuse(): never {
  throw new Error("firebase-admin/app est interdit dans les tests unitaires (base de production). Utiliser un mock ou l'émulateur.");
}

export function getApps(): never[] {
  return [];
}

export function getApp(): never {
  refuse();
}

export function initializeApp(): never {
  refuse();
}

export function cert(): never {
  refuse();
}

export function applicationDefault(): never {
  refuse();
}
