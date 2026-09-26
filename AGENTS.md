<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Conventions du projet Sextant

Section maintenue à la main, hors du bloc ci-dessus (régénéré par `next dev`). Présentation, commandes et routes : `README.md`.

## Serveur et données
- Tout module qui touche Firestore, Firebase Auth, un secret ou un service tiers (OpenAlex, fournisseur IA) commence par
  `import "server-only"` (`src/lib/<module>.ts`). Ce qui sert aux deux côtés va dans un `*-shared.ts` ou un module sans
  dépendance (ex. `src/lib/ids.ts`), jamais importé en valeur depuis un module serveur (QUAL-15).
- Types et validations communs au client et au serveur : `src/lib/<module>-shared.ts`, sans dépendance serveur. Le serveur
  revalide toujours ce qui vient du client (instantanés d'article rechargés depuis OpenAlex, textes nettoyés et bornés).
- Firestore n'est lu et écrit que par le serveur (SDK Admin) ; `firestore.rules` ferme tout au client.
- Compteurs, votes, liens de partage, plafonds : dans une transaction (`db.runTransaction`), rejouable sans double compte.
  Chaque transaction a son test dans `tests/emulator/`.
- Données rattachées à un compte hors de `users/{uid}` (ex. `shares`, `apiKeys`, `feedback.authorUid`) : les ajouter à
  `deleteAccountData` (`src/lib/account.ts`), à l'export RGPD (`src/app/api/account/export/route.ts`) et à la politique
  de confidentialité.

## Routes API
- Garde standard d'une écriture, dans cet ordre : `rejectCrossSite(req) ?? rejectLargeBody(req, n)` (`lib/security.ts`),
  `requireStrictUser()` (`lib/auth.ts`), `rateLimit(...)` (`lib/rate-limit.ts`), validation du corps, puis l'appel au module.
- Réponses JSON : succès `{ ...données }`, erreur `{ error: "Phrase en français, avec vouvoiement." }` et statut HTTP juste
  (400, 401, 403, 404, 413, 429, 502/503). Réponse personnelle : `cache-control: private, no-store`.
- Erreurs serveur : `logError(portée, e)` (`lib/log.ts`), jamais de corps, jeton, clé, cookie ni e-mail dans les journaux.

## Interface
- Français, vouvoiement. Composants shadcn / Base UI de `src/components/ui/`, icônes Lucide, jetons de couleur du thème
  (clair et sombre), pas de couleur en dur.
- Accessibilité : règles `jsx-a11y` en erreur, `npm run test:a11y` ; nom accessible qui reprend le texte visible.
- Métadonnées : `title`, `description` et `alternates.canonical` par page publique ; `robots: { index: false }` pour une
  page personnelle. Jamais d'`openGraph` dans une page : il remplacerait en entier celui du layout (nom du site, image).
  Nouvelle page publique : l'ajouter à `src/lib/sitemap.ts`.

## Qualité et livraison
- Avant un commit : `npx tsc --noEmit -p .`, `npm run lint` (0 avertissement), `npm test`, `npm run build`.
- Tests unitaires dans `tests/unit/` : jamais de base ni de réseau (tout se simule avec `vi.mock`).
- Commentaires en français, qui disent pourquoi ; référence du constat d'audit entre parenthèses (ex. `SEC-13`).
- Branches : `feat/<nom>` → pull request vers `dev` → `main` (production). Notes de travail dans `docs/handoffs/`.
- Aucun secret dans le dépôt : `.env.example` est versionné et reste sans valeur.
