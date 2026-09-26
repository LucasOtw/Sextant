import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Tests des transactions Firestore, sur l'émulateur local uniquement (`npm run test:emulator`, qui démarre les
 * émulateurs Firestore et Auth sous le projet `demo-sextant` puis lance cette configuration).
 * Ici, `@/lib/firebase/admin` est le vrai module : sa branche émulateur n'accepte qu'un projet `demo-…`, et
 * tests/emulator/setup.ts refuse de démarrer si un compte de service est présent ou si l'émulateur n'est pas désigné.
 * Chaque test travaille sous un uid unique : aucun nettoyage de la base n'est nécessaire (elle disparaît avec l'émulateur).
 */
const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^server-only$/, replacement: path.resolve(root, "node_modules/next/dist/compiled/server-only/empty.js") },
      { find: /^@\//, replacement: `${path.resolve(root, "src")}/` },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/emulator/**/*.test.ts"],
    setupFiles: ["tests/emulator/setup.ts"],
    restoreMocks: true,
    testTimeout: 20_000,
  },
});
