/**
 * Configuration publique de Firebase côté navigateur (clé d'API restreinte par domaine), sans le SDK : les composants
 * qui n'ont besoin que de savoir si la connexion est possible l'importent sans tirer firebase/app ni firebase/auth
 * dans le JavaScript de toutes les pages (PERF-02).
 */
function publicConfig() {
  // Accès littéraux : Next remplace ces trois valeurs au build dans le JavaScript du navigateur.
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

/**
 * Les trois valeurs publiques sont présentes : seul test « Firebase configuré », commun au navigateur et au serveur
 * (lib/auth, QUAL-24). Relu à chaque appel côté serveur.
 */
export function hasFirebasePublicConfig(): boolean {
  const c = publicConfig();
  return Boolean(c.apiKey && c.projectId && c.appId);
}

export const firebaseConfig = publicConfig();

export const isFirebaseConfigured = hasFirebasePublicConfig();
