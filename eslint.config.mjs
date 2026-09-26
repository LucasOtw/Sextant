import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Accessibilité (QUAL-43) : règles recommandées de jsx-a11y en erreur, au-delà des six que next active en « warn ».
  // Seules les règles sont reprises : le plugin est déjà déclaré par eslint-config-next (le redéclarer est refusé).
  { files: ["**/*.{js,jsx,mjs,ts,tsx}"], rules: jsxA11y.flatConfigs.recommended.rules },
  {
    rules: {
      // Interface en français : les apostrophes dans le JSX sont légitimes.
      "react/no-unescaped-entities": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    "public/pdf.worker.min.mjs",
    "public/pdfjs/**",
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
