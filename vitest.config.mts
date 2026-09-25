import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Tests unitaires (Vitest). Ils ne touchent jamais la base : la seule base Firestore est celle de la production.
 * - `server-only` est remplacé par le module vide de Next (le paquet lève une exception hors de la condition react-server).
 * - `@/lib/firebase/admin` est remplacé par un module qui refuse tout accès (tests/stubs/firebase-admin.ts).
 * - tests/setup.ts efface les variables de secrets avant chaque fichier de test.
 * Les tests de transactions Firestore viendront sur l'émulateur, dans un dossier et un script séparés (cf. README, « Tests et CI »).
 */
const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // Ordre important : le module Firebase Admin est intercepté avant l'alias générique « @ ».
    alias: [
      { find: /^@\/lib\/firebase\/admin$/, replacement: path.resolve(root, "tests/stubs/firebase-admin.ts") },
      { find: /^server-only$/, replacement: path.resolve(root, "node_modules/next/dist/compiled/server-only/empty.js") },
      { find: /^@\//, replacement: `${path.resolve(root, "src")}/` },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
