# Lot 9 — Conformité, référencement et documentation (branche `lot-9`)

Suite de l'audit du 24/09 (`2026-09-24-audit-complet.md`, section « Lot 9 »). Cette note couvre le **groupe 1** (conformité et documentation) ; le groupe 2 (QUAL-16, QUAL-17, QUAL-18 : métadonnées, robots, sitemap, OpenGraph ; NEW-11 : tri des retours) la complétera. Le détail de chaque correctif est dans les messages de commit.

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
