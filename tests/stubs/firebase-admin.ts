/**
 * Remplace `@/lib/firebase/admin` dans les tests unitaires (alias de vitest.config.ts) : aucun test unitaire ne doit
 * atteindre Firestore ni Firebase Auth, la seule base étant celle de la production. Un appel lève une erreur explicite.
 */
function refuse(): never {
  throw new Error("Firebase Admin est interdit dans les tests unitaires (base de production). Utiliser un mock ou l'émulateur.");
}

export function isAdminConfigured(): boolean {
  return false;
}

export async function adminAuth(): Promise<never> {
  refuse();
}

export async function adminDb(): Promise<never> {
  refuse();
}
