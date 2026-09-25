/**
 * Exécuté avant chaque fichier de test sur émulateur. Garde-fous : la seule base Firestore réelle est celle de la
 * production, ces tests écrivent ; ils ne démarrent donc que si tout désigne l'émulateur et un projet `demo-…`.
 */
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT est défini : tests sur émulateur refusés (risque d'écrire en production).");
}
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error("Émulateurs non désignés (FIRESTORE_EMULATOR_HOST, FIREBASE_AUTH_EMULATOR_HOST) : lancer `npm run test:emulator`.");
}
const project = process.env.GCLOUD_PROJECT ?? "";
if (!project.startsWith("demo-")) {
  throw new Error(`Projet « ${project} » refusé : seul un projet demo-… est accepté (npm run test:emulator).`);
}

// Aucun autre identifiant ni clé : ni ceux du shell, ni les identifiants par défaut de gcloud du poste.
for (const name of ["GOOGLE_APPLICATION_CREDENTIALS", "OPENALEX_API_KEY", "MISTRAL_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "ANTHROPIC_API_KEY"]) {
  delete process.env[name];
}
process.env.CLOUDSDK_CONFIG = "/nonexistent";
// Pas de recherche du serveur de métadonnées GCE (identifiants par défaut) : rien ne doit sortir du poste.
process.env.METADATA_SERVER_DETECTION = "none";
