/**
 * Exécuté avant chaque fichier de test unitaire. Garde-fou : aucun secret ni identifiant de production n'est visible
 * des tests, même si le shell du développeur en exporte (les variables sont effacées, pas seulement ignorées).
 */
const SECRETS = [
  "FIREBASE_SERVICE_ACCOUNT",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "OPENALEX_API_KEY",
  "MISTRAL_API_KEY",
  "GROQ_API_KEY",
  "OPENROUTER_API_KEY",
  "ANTHROPIC_API_KEY",
];

for (const name of SECRETS) delete process.env[name];

// Identifiants par défaut de Google (ADC) : sans cela, un module qui appellerait `applicationDefault()` ou
// `@google-cloud/firestore` directement retomberait sur ~/.config/gcloud du poste, donc sur la base de production.
// Des chemins inexistants font échouer ces identifiants au lieu de les trouver.
process.env.CLOUDSDK_CONFIG = "/nonexistent";
process.env.GOOGLE_APPLICATION_CREDENTIALS = "/nonexistent";

// Les tests unitaires n'appellent jamais le réseau : un fetch oublié échoue au lieu de partir vers OpenAlex ou un fournisseur IA.
globalThis.fetch = (() => Promise.reject(new Error("fetch interdit dans les tests unitaires : le simuler (vi.stubGlobal)."))) as typeof fetch;
