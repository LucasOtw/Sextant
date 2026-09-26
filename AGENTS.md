<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Conventions du projet Sextant

Section maintenue à la main, hors du bloc ci-dessus (régénéré par `next dev`). Présentation, commandes et routes : `README.md`.

## Glossaire (code ↔ interface)
Les noms du code, de Firestore, de l'API, de l'export et des outils MCP sont des contrats stables : on ne les renomme
pas pour suivre l'interface (QUAL-38).
- `collections` (Firestore, `/api/collections`, type `Collection`, `lib/collections*.ts`) = « listes » dans l'interface
  (`?liste=`, `/liste/[token]`), clé `lists` de l'export RGPD, outils MCP `list_my_lists` et `get_list`.
- `highlights` (Firestore, `/api/highlights`, type `Highlight`, `components/highlights/`) = « surlignages » ou
  « citations » dans l'interface (page `/citations`, « Mes citations »), clé `citations` de l'export, outil MCP
  `get_my_citations`.
- `cited_by_count` / `citedByCount` (OpenAlex) = nombre de citations bibliométriques d'un article ou d'un auteur, sans
  rapport avec les passages retenus.

## Serveur et données
- Tout module qui touche Firestore, Firebase Auth, un secret ou un service tiers (OpenAlex, fournisseur IA) commence par
  `import "server-only"` (`src/lib/<module>.ts`). Ce qui sert aux deux côtés va dans un `*-shared.ts` ou un module sans
  dépendance (ex. `src/lib/ids.ts`), jamais importé en valeur depuis un module serveur (QUAL-15).
- Types et validations communs au client et au serveur : `src/lib/<module>-shared.ts`, sans dépendance serveur. Le serveur
  revalide toujours ce qui vient du client (instantanés d'article rechargés depuis OpenAlex, textes nettoyés et bornés).
- Firestore n'est lu et écrit que par le serveur (SDK Admin) ; `firestore.rules` ferme tout au client.
- Compteurs, votes, liens de partage, plafonds : dans une transaction (`db.runTransaction`), rejouable sans double compte.
  Chaque transaction a son test dans `tests/emulator/`.
- `users/{uid}` n'est jamais lu ni écrit depuis `src/app` : profil et dates par `src/lib/account.ts`, compteurs et
  index par leur module (`favorites.ts`, `collections.ts`, `api-keys.ts`) (QUAL-23).
- Données rattachées à un compte (ex. `shares`, `apiKeys`, `feedback.authorUid`) : les ajouter à la liste en tête de
  `src/lib/account.ts`, à `deleteAccountData`, à l'export RGPD (`src/app/api/account/export/route.ts`) et à la
  politique de confidentialité.

## Routes API
- Garde d'une route d'un compte : `const { user, refused } = await requireUser(req, { bucket, maxBody, read? })`
  (`lib/api/guard.ts`, QUAL-05), puis validation du corps et appel au module. Elle enchaîne même site, taille du corps,
  session stricte (écriture) ou tolérante (`read: true`) et limite du seau. Jamais de séquence recopiée à la main.
- Route publique : `overLimit(seau, clientIp(req))` puis `tooMany()`. Toute limite se déclare dans `RATE_LIMITS`
  (`lib/api/guard.ts`), table unique : pas de `rateLimit(...)` appelé directement depuis une route.
- Réponses JSON : succès `{ ...données }`, erreur `{ error: "Phrase en français, avec vouvoiement." }` et statut HTTP juste
  (400, 401, 403, 404, 413, 429, 502/503). Réponse personnelle : en-têtes `PRIVATE` (`lib/api/guard.ts`).
- Panne d'un service : `return serverError(portée, e, "Message pour l'utilisateur.")` (journalise puis 502) ; jamais
  de corps, jeton, clé, cookie ni e-mail dans les journaux.

## Interface
- Stockage du navigateur : `lib/client/storage.ts` (jamais de try/catch recopié) ; valeur connue seulement du
  navigateur et fixe pendant la visite : `useClientValue` (`hooks/use-client-value.ts`) plutôt qu'un effet (QUAL-31).
- Textes reçus : `cleanText` / `tooLong` / `fold` de `lib/text.ts` ; dates affichées : formats de `lib/dates.ts`
  (heure de Paris), jamais un `Intl.DateTimeFormat` local (QUAL-30).
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
