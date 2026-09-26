# Lot 9 — Conformité, référencement et documentation (branche `lot-9`)

Suite de l'audit du 24/09 (`2026-09-24-audit-complet.md`, section « Lot 9 »). Cette note couvre le **groupe 1** (conformité et documentation) et le **groupe 2** (QUAL-16, QUAL-17, QUAL-18 : métadonnées, robots, sitemap, OpenGraph ; NEW-11 : tri des retours), en fin de note. Le détail de chaque correctif est dans les messages de commit.

## Constats traités (groupe 1)

| Constat | Correctif | Fichiers principaux |
|---|---|---|
| NEW-2 | Export RGPD complet : date de dernière connexion, dernier favori retiré (« Annuler »), liens de partage et leur date, clés sans empreinte (avec la date de la session qui les a créées), sujets publiés et votes datés sur « Bugs et idées ». Inventaire exact sur « Mon compte », dans la politique et dans les mentions légales. Rien d'autre n'est rattaché au compte : les condensés IA ne dépendent que de l'article, aucune session ni historique n'est stocké côté serveur | `api/account/export/route.ts`, `lib/feedback.ts`, `lib/api-keys.ts`, `lib/shares.ts`, `compte/page.tsx`, `confidentialite/page.tsx` |
| NEW-14 | Partie technique seulement, **aucune durée choisie**. `lib/retention.ts` porte les deux durées (`null` = pas de purge) ; la politique les affiche, ou un emplacement « à compléter » tant qu'elles valent `null`. Suppression d'un compte extraite dans `deleteAccountData` (`lib/account.ts`), partagée par « Supprimer mon compte » et la purge `purgeInactive`. Route `GET /api/cron/retention` : refuse tout sans `CRON_SECRET`, ne fait rien sans durée, `?dryRun=1` compte sans supprimer, 50 comptes au plus par passage | `lib/retention.ts`, `lib/account.ts`, `api/cron/retention/route.ts`, `api/auth/account/route.ts` |
| NEW-13 | Aucune licence choisie. La page ne renvoie plus à des « conditions indiquées dans le dépôt » qui n'existent pas : elle dit qu'aucune licence n'est attachée pour l'instant (droits réservés), et affichera la licence dès que `SITE.codeLicense` sera renseigné | `lib/site.ts`, `mentions-legales/page.tsx` |
| SEC-13 | Section « Signaler un contenu » (`/mentions-legales#signaler`, DSA art. 16) ; lien « Signaler » sur chaque sujet de /retours (ancre `#sujet-<id>`) et sur chaque liste partagée : courriel prérempli (URL, motif, coordonnées, bonne foi) vers l'adresse de contact existante, ou la section des mentions légales si elle n'est pas configurée. Conditions d'utilisation : sujets « Bugs et idées » couverts, retrait d'un contenu illicite et désactivation d'un lien (DSA art. 14) | `lib/report.ts`, `feedback-board.tsx`, `retours/page.tsx`, `liste/[token]/page.tsx`, `conditions/page.tsx` |
| SEC-18 | `/api/recommendations` en `cache-control: private, max-age=300` (plus de copie au CDN) ; politique exacte (identifiants dans l'adresse, suggestions écartées comprises, journaux de l'hébergeur) ; commentaire de `lib/recent.ts` corrigé. Le passage en POST (facultatif) n'est pas fait | `api/recommendations/route.ts`, `confidentialite/page.tsx`, `lib/recent.ts` |
| QUAL-42 | README : promesses de vie privée alignées sur /confidentialite (liens vers les pages en ligne), 14 pages et API par préfixe, organisation de `src/lib` par familles, Firebase facultatif au démarrage. `AGENTS.md` : section « Conventions du projet » hors du bloc régénéré par `next dev` | `README.md`, `AGENTS.md` |
| QUAL-25 | `!.env.example` après `.env*` dans `.gitignore` ; `.env.example` versionné, vérifié ligne par ligne : toutes les affectations sont vides, seuls trois exemples commentés non secrets (`AI_PROVIDER=mistral`, `AI_MODEL=ministral-8b-latest`, `ALLOW_PROD_DB=1`). `CRON_SECRET=` ajouté | `.gitignore`, `.env.example` |

## Écarts par rapport aux recommandations

- **NEW-14, critère d'inactivité** : dernière connexion Google (`lastSignInTime`, `lastRefreshTime`), création du compte et dernier usage (ou création) d'une de ses clés encore présentes. Si la durée des clés est plus courte que celle des comptes, une clé purgée cesse de protéger le compte : un utilisateur « assistant IA seulement » est alors supprimé quand sa dernière connexion dépasse la durée des comptes, même si sa clé a servi entre-temps. Choisir une durée de clé au moins égale à celle des comptes évite ce cas.
- **NEW-14, `vercel.json`** : la tâche planifiée n'y est pas déclarée (réglage de déploiement, décision du propriétaire) ; voir ci-dessous.
- **SEC-13** : pas de suppression d'un sujet par son auteur (option M facultative de l'audit) ni de `noindex` sur /retours (laissé au groupe 2, QUAL-17).

## Procédure de retrait d'un contenu signalé (SEC-13)

1. Ouvrir la console Firebase, projet de production, Firestore.
2. Sujet de /retours : l'identifiant est dans l'objet du courriel et dans l'ancre `#sujet-<id>` ; supprimer `feedback/<id>`. La liste publique se relit en 60 s au plus (cache de /retours). Les votes orphelins dans `users/*/feedbackVotes` sont sans effet.
3. Liste partagée : le jeton est dans l'adresse `/liste/<jeton>` ; supprimer `shares/<jeton>`. Effet immédiat (page rendue à chaque visite). Le champ `shareToken` de la liste de l'utilisateur peut rester : la page vérifie les deux.
4. Répondre à l'auteur du signalement avec la décision (DSA art. 16.5).

## À faire par le propriétaire

1. **Licence du code (NEW-13)**, au choix :
   - ouvrir le code : ajouter un fichier `LICENSE` (texte officiel), `"license": "<SPDX>"` dans `package.json`, `codeLicense: "<SPDX>"` dans `src/lib/site.ts` (la page affiche alors la licence et précise qu'elle ne couvre ni le nom ni le logo), une section « Licence » au README. AGPL-3.0-only si un service dérivé doit publier ses modifications ; MIT pour une réutilisation libre ;
   - garder les droits : rien à faire (la page le dit déjà) ; éventuellement `"license": "UNLICENSED"` dans `package.json`.
2. **Durées de conservation (NEW-14)** : renseigner `inactiveAccountMonths` et `unusedKeyMonths` dans `src/lib/retention.ts` (usage courant : 24 ou 36 mois pour un compte, 12 mois ou plus pour une clé ; voir l'écart ci-dessus). Puis : définir `CRON_SECRET` dans Vercel (Production seulement), appeler une fois `GET /api/cron/retention?dryRun=1` avec `Authorization: Bearer <secret>` pour lire les nombres, et seulement ensuite déclarer la tâche dans `vercel.json` (`"crons": [{ "path": "/api/cron/retention", "schedule": "0 4 1 * *" }]`, mensuel, compatible Hobby). Sans ces étapes, la politique garde l'emplacement « à compléter ».
3. **Adresse des signalements (SEC-13)** : `LEGAL_CONTACT_EMAIL` (déjà utilisée par les mentions légales) doit être définie en production, sans quoi les liens « Signaler » mènent à la section des mentions légales, qui affiche « [adresse de contact à compléter] ». Relever cette boîte et répondre à chaque signalement.
4. **Relecture juridique** des textes ajoutés (section « Signaler un contenu », conditions d'utilisation, politique de confidentialité).

## Vérifications faites

- `npx tsc --noEmit -p .`, `npm run lint`, `npm test` (38 fichiers, 473 tests), `npm run build`.
- Sur le serveur de dev branché aux émulateurs : export d'un compte avec liste partagée, sujet, vote et clé (tous les nouveaux champs présents, aucune empreinte de clé) ; /compte ; `GET /api/cron/retention` → 503 sans secret ; `cache-control: private, max-age=300` sur `/api/recommendations`.
- Rendu Chrome : /mentions-legales (clair), /confidentialite (sombre), /retours (liens « Signaler » avec nom accessible), /liste/<jeton> ; aucune erreur console, aucun débordement.
- Non lancés (à lancer par le coordinateur) : `tests/emulator/retention.test.ts` et `tests/emulator/export.test.ts` (`npm run test:emulator`). Le support de `importUsers` avec dates anciennes par l'émulateur Auth a été vérifié à part.

## Groupe 2 : référencement et « Bugs et idées »

| Constat | Correctif | Fichiers principaux |
|---|---|---|
| QUAL-16 | `htmlLimitedBots` = copie de la liste de Next 16.3.6 **+ Googlebot** (la liste de Next est remplacée, pas complétée : rien n'en est retiré). Googlebot reçoit titre, description et balises de partage dans le `<head>`. Mesuré sur `next start` : article non encore en cache, UA Chrome → description à l'octet 121 538 (body) ; UA Googlebot → octet 2 906, avant `</head>` (5 452). `tests/unit/seo.test.ts` compare la copie à la liste de Next installée : il échoue à la prochaine mise à jour de Next qui la change | `lib/html-bots.ts`, `next.config.ts` |
| QUAL-17 | `robots.txt` : `Disallow` sur `/api/`, `/search` (espace infini, un rendu et un appel OpenAlex par adresse) et `/__/auth/`, plus l'adresse du plan. Pas de `noindex` sur /search (un robot exclu ne le lirait pas). `/sitemap.xml` (ISR 1 h) : accueil, 16 thèmes, /retours, 4 pages d'information et légales, et les 6 articles de la « Sélection du moment » (même requête OpenAlex que l'accueil, déjà en cache ; en cas de panne, le plan sort sans eux). `noindex` sur /favoris, /citations, /compte ; /liste garde le sien, sans `Disallow` pour qu'il soit lu | `app/robots.ts`, `app/sitemap.ts`, `lib/sitemap.ts`, `favoris`, `citations`, `compte` |
| QUAL-18 | Layout : `metadataBase` (adresse de production), `openGraph` (nom du site, `fr_FR`, `website`) et `twitter: summary_large_image` ; og:title / og:description repris de chaque page par Next. Image de partage statique 1200 × 630 (`app/opengraph-image.png` + `.alt.txt`, source `scripts/og-image.html`, régénération par Chrome headless décrite dans le fichier). Thèmes : description propre + canonique `/theme/<slug>`. Articles : canonique `/article/<W…>` (identifiant rendu par OpenAlex), description coupée au mot avec « … », ou notice « Article de A et B. Revue, 2024. » sans résumé. Pages d'information, légales et /retours : description propre et canonique | `app/layout.tsx`, `theme/[slug]/page.tsx`, `article/[id]/page.tsx`, `lib/format.ts`, `lib/themes.ts` |
| NEW-11 | `listFeedback` lit les 100 sujets les plus votés **et** les 200 plus récents (index simples, pas d'index composite), dédoublonnés, plus les totaux par type (`count()`). Compteurs « Tous / Bugs / Idées » justes au-delà de la limite (totaux + sujets publiés depuis le chargement) ; mention « Sont affichés les sujets les plus votés et les plus récents : X sur Y. » quand la liste est tronquée. Clé de cache `feedback-list-v2` (la valeur a changé de forme) | `lib/feedback.ts`, `lib/feedback-shared.ts`, `retours/page.tsx`, `feedback-board.tsx` |

### Écarts par rapport aux recommandations

- **QUAL-18** : image de partage en PNG statique plutôt que `opengraph-image.tsx` (`ImageResponse`) : le moteur de rendu de `next/og` espaçait mal certains mots avec Geist, et un fichier `.png` ne passe ni par une fonction ni par le proxy. Pas d'`apple-icon.png` : `public/apple-touch-icon.png` existe déjà (NEW-10). Pas d'image dynamique par article (option M).
- **QUAL-18** : `og:title` garde le suffixe « · Sextant » du modèle de titre (comportement de Next).
- **NEW-11** : les sujets « Pas pour l'instant » ne sont pas exclus de la requête des récents (option complémentaire) : il faudrait un index composite.
- **QUAL-16** : contrepartie assumée, Googlebot attend `generateMetadata` (lecture OpenAlex en cache) avant le premier octet.

### À faire par le propriétaire (groupe 2)

1. Après la mise en production : déclarer `https://sextant-psi.vercel.app/sitemap.xml` dans Google Search Console (et Bing Webmaster Tools si voulu), propriété à créer par le propriétaire du domaine.
2. Vérifier un aperçu réel (coller un lien d'article dans une messagerie, ou l'outil d'inspection de LinkedIn / Facebook) une fois en production.
3. Si un domaine personnalisé remplace `sextant-psi.vercel.app` : mettre à jour `SITE.url` (`src/lib/site.ts`), qui sert au plan du site, au robots.txt et aux canoniques.

### Vérifications faites (groupe 2)

- `npx tsc --noEmit -p .`, `npm run lint`, `npm test` (40 fichiers, 490 tests), `npm run build` (robots.txt, opengraph-image.png statiques ; sitemap.xml en ISR 1 h).
- Serveur de dev (émulateurs) : robots.txt, sitemap.xml (28 adresses), balises og/twitter/canonical sur /, /theme/informatique, /article/w2741809807 (canonique en `W` majuscule), `noindex` sur /favoris.
- /retours avec 330 sujets semés dans l'émulateur (20 anciens très votés, puis supprimés) : 261 sujets chargés sur 342, les 20 anciens en tête du tri « Les plus votés », compteurs 342 / 87 / 255 ; rendu Chrome clair et sombre.
- `tests/emulator/feedback-list.test.ts` passé une fois contre l'émulateur du serveur de dev (documents créés supprimés ensuite) ; à relancer par le coordinateur avec `npm run test:emulator`.
