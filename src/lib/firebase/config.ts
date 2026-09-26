/**
 * Configuration publique de Firebase côté navigateur (clé d'API restreinte par domaine), sans le SDK : les composants
 * qui n'ont besoin que de savoir si la connexion est possible l'importent sans tirer firebase/app ni firebase/auth
 * dans le JavaScript de toutes les pages (PERF-02).
 */
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
