import { defineConfig, devices } from "@playwright/test";

/**
 * Banc d'accessibilité (QUAL-43) : `npm run test:a11y`. Il visite un site déjà démarré, sans rien lancer lui-même :
 * - en CI (.github/workflows/a11y.yml), l'aperçu Vercel du déploiement (BASE_URL) ;
 * - en local, le serveur de dev (http://localhost:3000 par défaut).
 * Les pages lisent la base de production : tests/a11y.spec.ts bloque toute requête autre que GET/HEAD.
 * PW_CHANNEL=chrome utilise le Chrome installé au lieu du Chromium de Playwright (poste sans `playwright install`).
 */
export default defineConfig({
  testDir: "tests",
  testMatch: "a11y.spec.ts",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    locale: "fr-FR",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL || undefined } }],
});
