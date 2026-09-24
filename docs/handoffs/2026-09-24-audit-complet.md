# Audit complet de Sextant

## 1. Cadre

- **Date** : 24 septembre 2026
- **Périmètre** : production https://sextant-psi.vercel.app, commit `b9c257a` (dev = main). 14 pages (`/`, `/search`, `/theme/[slug]`, `/article/[id]`, `/article/[id]/lire`, `/favoris`, `/citations`, `/compte`, `/liste/[token]`, `/retours`, `/a-propos`, `/conditions`, `/confidentialite`, `/mentions-legales`) et 22 routes API (`auth`, `account`, `favorites`, `collections`, `highlights`, `notes`, `feedback`, `pdf`, `summary`, `suggest`, `author`, `recommendations`, `mcp`, `health`).
- **Méthode** :
  1. Mesures : Lighthouse 13.5 (11 rapports, mobile et desktop), axe-core 4.10 via Playwright (8 pages × 2 thèmes + 3 états de fenêtre), `npm audit`, `next build`, knip, depcheck, jscpd, madge, requêtes GET/HEAD en production.
  2. 8 relectures de code : sécurité serveur, sécurité client, performance serveur, performance client, accessibilité des composants, accessibilité des pages, architecture, robustesse ; plus une passe « angles morts ».
  3. Consolidation : fusion des doublons entre relecteurs, un seul constat par défaut.
  4. Vérification contradictoire de chaque constat (confirmé / partiel / réfuté), sévérité réajustée au besoin.
  5. Lecture seule stricte : aucune écriture en base, aucun fichier du dépôt modifié, aucun secret affiché.

## 2. Synthèse

### Notes par axe

| Axe | Note | Justification |
|---|---|---|
| Performance | **6/10** | Desktop excellent (98 à 100), mais mobile à 62–69 et tout le site rendu à la demande en `no-store` depuis iad1 (États-Unis), sans aucun cache CDN. |
| Sécurité | **7/10** | Socle solide (règles Firestore fermées, sessions, CSRF, aucun IDOR) et aucune faille critique confirmée, mais plusieurs routes anonymes coûteuses sans limite (`/api/summary`, `/liste`, MCP) et aucun en-tête de sécurité. |
| Accessibilité | **6/10** | Lighthouse à 96–100, mais défilement horizontal sur tous les téléphones (échec WCAG 1.4.10), focus peu contrasté et plusieurs composants clés inutilisables au clavier. |
| Qualité | **6/10** | TypeScript strict, lint et typage à 0 erreur, mais aucun test ni CI, aucune frontière d'erreur, aucune journalisation serveur et deux implémentations divergentes des citations. |

### Scores Lighthouse mesurés (production, 24/09, un passage par page)

| Page | Profil | Perf | A11y | BP | SEO | FCP | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|---|---|
| Accueil | mobile | 65 | 100 | 100 | 100 | 4,6 s | 6,1 s | 38 ms | 0 |
| Accueil | desktop | 100 | 100 | 100 | 100 | 0,3 s | 0,4 s | 0 ms | 0 |
| Recherche « télétravail » | mobile | 66 | 96 | 100 | 100 | 4,3 s | 6,1 s | 0 ms | 0 |
| Recherche « télétravail » | desktop | 100 | 96 | 100 | 100 | 0,4 s | 0,6 s | 0 ms | 0 |
| Article W4406431707 | mobile | 68 | 100 | 96 | 90 | 4,5 s | 5,6 s | 0 ms | 0 |
| Article W4406431707 | desktop | 98 | 100 | 96 | 90 | 0,3 s | 0,6 s | 0 ms | 0,095 |
| Lecteur W2626778328/lire | mobile | 62 | 100 | 100 | 90 | 4,4 s | 16,4 s | 103 ms | 0,001 |
| /retours | mobile | 95 | 100 | 100 | 100 | 1,2 s | 2,9 s | 13 ms | 0 |
| /a-propos | mobile | 69 | 100 | 100 | 100 | 4,3 s | 5,4 s | 0 ms | 0 |
| /theme/informatique | mobile | 64 | 96 | 100 | 100 | 4,9 s | 6,0 s | 0 ms | 0 |
| /favoris (anonyme) | mobile | 66 | 100 | 100 | 100 | 4,4 s | 5,9 s | 0 ms | 0 |
| Contrôle : accueil, Firebase/Google bloqués | mobile | 88 | 100 | 100 | 100 | 1,0 s | 3,5 s | 10 ms | 0 |

Réserve : le gain du contrôle (65 → 88) vient en grande partie de la simulation Lantern. En bridage réel (`--throttling-method=devtools`), la vérification a mesuré 98–99 avec ou sans les domaines Google (voir PERF-02).

### À vérifier immédiatement (signal hors constats retenus)

Lors de la vérification de SEC-02, un relecteur a relevé qu'en production le « modèle » affiché sur la fiche article (props RSC `model`, attribut `title`, JSON de `/api/summary`) est une chaîne de 45 caractères au préfixe `mstrl_`, alors qu'en local c'est `ministral-8b-latest`. La variable `AI_MODEL` de production contient donc très probablement un secret (vraisemblablement la clé Mistral collée dans la mauvaise variable), publié sur chaque page article. Cause dans le code : `src/lib/ai.ts:51` renvoie `process.env.AI_MODEL` tel quel et `src/app/article/[id]/page.tsx:200-205` le transmet au client. Non confirmé (journaux Vercel inaccessibles, pas de POST autorisé), donc non compté dans les 145 constats. **Action (S, 10 min)** : ouvrir la variable dans Vercel ; si c'est une clé, remettre `AI_MODEL=ministral-8b-latest` (ou la supprimer), redéployer et faire tourner la clé Mistral (ticket #9).

### Les 5 actions prioritaires

1. **Fermer les routes anonymes coûteuses** (Lot 1, ~1 j) : `rejectCrossSite` + `rateLimit` sur `/api/summary` (SEC-02), `cache()` et limite par IP sur `/liste/[token]` (SEC-01), lectures bornées dans le MCP (SEC-07), règle de limitation de débit du pare-feu Vercel sur `/api/pdf`, `/liste/*`, `/retours` (NEW-3, SEC-04), vérification du plan Firebase et alerte de budget.
2. **Supprimer le débordement horizontal mobile** (A11Y-01, A11Y-02, S) : les deux seuls constats de sévérité élevée, qui touchent toutes les pages sur tous les téléphones.
3. **Rendre les pages statiques mises en cache et alléger le layout** (PERF-01, PERF-02, PERF-04) : identité récupérée côté client, SDK Firebase Auth chargé à la demande, fonctions en `cdg1`.
4. **Rendre les pannes visibles** (QUAL-03, QUAL-04, QUAL-01, NEW-1) : `error.tsx`/`global-error.tsx` en français, journalisation serveur, correction du filtre « Toutes les sources », signalement des articles rétractés dans le MCP et l'autocomplétion.
5. **Poser le socle de tests et de CI** (QUAL-19, QUAL-20, connu) avant les refactorisations (QUAL-02, QUAL-05, QUAL-10, QUAL-12).

## 3. Récapitulatif des 145 constats retenus

| ID | Axe | Sévérité | Titre | Effort |
|---|---|---|---|---|
| SEC-01 | sécurité | moyenne | /liste/[token] : jusqu'à ~2 000 lectures Firestore par vue anonyme | M |
| SEC-02 | sécurité | moyenne | /api/summary : appel LLM anonyme sans limite de débit ni contrôle d'origine | S |
| SEC-07 | sécurité | moyenne | Amplification des lectures Firestore via les outils MCP et deux GET d'API | M |
| SEC-03 | sécurité | faible | Aucun en-tête de sécurité applicatif et x-powered-by exposé | M |
| SEC-04 | sécurité | faible | Routes publiques sans limite de débit (suggest, author, HEAD pdf, échecs MCP) | S |
| SEC-05 | sécurité | faible | SSRF résiduel dans le relais PDF (redirections, filtre par nom d'hôte) | M |
| SEC-06 | sécurité | faible | Métadonnées d'article fournies par le client stockées telles quelles | M |
| SEC-08 | sécurité | faible | La déconnexion ne révoque pas la session (cookie valable 14 jours) | S |
| SEC-09 | sécurité | faible | Suppression de compte et création de clé MCP sans ré-authentification récente | S |
| SEC-10 | sécurité | faible | /api/health public : empreinte de configuration | S |
| SEC-11 | sécurité | faible | Clés MCP valides après désactivation du compte, sans expiration | S |
| SEC-12 | sécurité | faible | Session Firebase conservée dans IndexedDB en plus du cookie HttpOnly | S |
| SEC-13 | sécurité | faible | Contenu public (listes, « Bugs et idées ») sans signalement ni modération | M |
| SEC-14 | sécurité | faible | Votes « Bugs et idées » gonflables (suppression/recréation de compte) | S |
| SEC-15 | sécurité | faible | Chemins et paramètres injectés dans les requêtes OpenAlex | S |
| SEC-16 | sécurité | faible | URL OpenAlex sans contrôle de schéma, repli `<object>` non validé | S |
| SEC-17 | sécurité | faible | Contrôle de taille du corps contournable et absent sur deux routes | S |
| SEC-18 | sécurité | faible | « Pour vous » : historique dans l'URL d'un GET mis en cache public | S |
| SEC-19 | sécurité | faible | Notes sans plafond ; export RGPD tronqué à 2 000 notes | S |
| SEC-21 | sécurité | faible | 8 vulnérabilités modérées transitives (uuid) via firebase-admin 13 | M |
| SEC-22 | sécurité | faible | Instructions MCP : mcp-remote non épinglé, clé dans l'historique du shell | S |
| NEW-2 | sécurité | faible | Export RGPD incomplet et inventaire inexact sur « Mon compte » | S |
| NEW-3 | sécurité | faible | Relais PDF : coût en bande passante exposé, cache CDN contournable | S |
| NEW-4 | sécurité | faible | Développement local branché sur la base et l'auth de production | M |
| NEW-14 | sécurité | faible | Aucune durée de conservation pour comptes inactifs et clés inutilisées | M |
| PERF-01 | performance | moyenne | Le layout lit le cookie : tout le site rendu à la demande en no-store | M |
| PERF-02 | performance | moyenne | SDK Firebase Auth chargé sur chaque page, iframe Google sur mobile/Safari | M |
| PERF-04 | performance | moyenne | Fonctions en iad1 pour un public francophone, Firestore annoncé à Paris | S |
| PERF-06 | performance | moyenne | Lecteur PDF : fichier téléchargé en entier avant le premier rendu | M |
| PERF-14 | performance | moyenne | « Pour vous » se recharge à chaque cœur et la grille bouge | S |
| PERF-19 | performance | moyenne | CLS à l'arrivée de l'article (0,095 desktop, 0,257 mobile réel) | S |
| PERF-27 | performance | moyenne | Lecteur PDF : hauteur A4 provisoire, « aller à la page » imprécis | S |
| PERF-28 | performance | moyenne | Champs Années : navigation serveur au simple passage du focus | S |
| PERF-03 | performance | faible | Base UI Menu et floating-ui dans le bundle du layout pour tous | S |
| PERF-05 | performance | faible | verifySessionCookie(token, true) : appel réseau à chaque rendu connecté | S |
| PERF-07 | performance | faible | Aucun délai maximal sur les appels OpenAlex, Mistral, Anthropic | S |
| PERF-08 | performance | faible | /retours : jusqu'à 300 documents lus à chaque visite | S |
| PERF-09 | performance | faible | Fiche article : Firestore après OpenAlex, users/{uid} lu deux fois | M |
| PERF-10 | performance | faible | Cascade des requêtes favoris côté client | M |
| PERF-11 | performance | faible | /favoris et /citations rendus d'un bloc, filtre recalculé à chaque frappe | M |
| PERF-12 | performance | faible | FavoritesProvider : contexte unique qui re-rend tous les consommateurs | M |
| PERF-15 | performance | faible | Condensé IA : cache mémoire par instance, POST non cacheable | S |
| PERF-16 | performance | faible | Worker et ressources PDF.js sans cache long, chemin non versionné | S |
| PERF-17 | performance | faible | Lecteur PDF : chargement en cascade (chunk, worker, PDF) | S |
| PERF-18 | performance | faible | Rafale de préchargements RSC en no-store (16 sur l'accueil) | S |
| PERF-20 | performance | faible | SDK Anthropic importé statiquement pour un fournisseur inactif | S |
| PERF-21 | performance | faible | WelcomeDialogContent : commentaire « chargé à la demande » périmé | S |
| PERF-22 | performance | faible | Recherche avec contexte : l'en-tête bloque la page et la recherche | S |
| PERF-23 | performance | faible | /compte lit deux fois users/{uid} | S |
| PERF-24 | performance | faible | Firestore en gRPC : démarrage à froid plus lourd qu'en REST | S |
| PERF-25 | performance | faible | /api/recommendations renvoie des Work complets pour une carte compacte | S |
| PERF-26 | performance | faible | Lecteur : sélection recalculée au défilement, minuteurs orphelins | S |
| NEW-9 | performance | faible | Écritures redondantes sur users/{uid}, aucune exemption d'index | S |
| NEW-10 | performance | faible | Ni favicon.ico, ni apple-touch-icon, ni manifeste, ni theme-color | S |
| A11Y-01 | accessibilité | élevée | En-tête trop large : défilement horizontal sous ~435 px sur toutes les pages | S |
| A11Y-02 | accessibilité | élevée | Grilles sans colonne de base : accueil et /search débordent à 375 et 320 px | S |
| A11Y-03 | accessibilité | moyenne | Indicateur de focus à 50 % d'opacité (1,82:1 clair, 2,05:1 sombre) | S |
| A11Y-04 | accessibilité | moyenne | Langue des titres et résumés étrangers non déclarée | S |
| A11Y-05 | accessibilité | moyenne | Fiche auteur : se ferme quand le focus y entre, liens inaccessibles au clavier | M |
| A11Y-06 | accessibilité | moyenne | Note d'un passage : l'aria-label cache le texte de la note | S |
| A11Y-08 | accessibilité | moyenne | Élément focalisé masqué par l'en-tête collant (aucun scroll-padding) | S |
| A11Y-09 | accessibilité | moyenne | Suggestions : liens imbriqués dans les options, nombre non annoncé | M |
| A11Y-10 | accessibilité | moyenne | Suggestions : la liste reste ouverte et masque l'élément focalisé | S |
| A11Y-12 | accessibilité | moyenne | Changements de résultats non annoncés, focus renvoyé sur body | M |
| A11Y-13 | accessibilité | moyenne | Erreurs et messages d'état non annoncés (connexion, condensé, « Copié ») | M |
| A11Y-18 | accessibilité | moyenne | Surlignage réservé à la sélection souris/doigt, bouton non annoncé | M |
| A11Y-20 | accessibilité | moyenne | Toasts « Annuler » visibles 3,5 s seulement | S |
| A11Y-22 | accessibilité | moyenne | Lecteur PDF : texte des pages éloignées effacé, surlignages visuels seulement | M |
| A11Y-33 | accessibilité | moyenne | Textes tronqués sans alternative accessible | S |
| A11Y-07 | accessibilité | faible | Fenêtre d'accueil modale partout, sans Échap ni clic extérieur | S |
| A11Y-11 | accessibilité | faible | Aucun lien d'évitement, focus perdu à la pagination | S |
| A11Y-14 | accessibilité | faible | Aucun h1 sur /search, h1 suivi d'un h3 sur /theme | S |
| A11Y-15 | accessibilité | faible | Rouge « destructive » sous 4,5:1 en thème clair | S |
| A11Y-16 | accessibilité | faible | Vote actif en sombre : blanc sur accent-brand à 2,32:1 | S |
| A11Y-17 | accessibilité | faible | Bordures des champs à 1,42:1 et 1,47:1 | S |
| A11Y-19 | accessibilité | faible | Focus perdu quand l'élément actif disparaît ou se désactive | M |
| A11Y-21 | accessibilité | faible | Placeholder seul libellé visible, contraintes non indiquées | M |
| A11Y-23 | accessibilité | faible | Noms accessibles génériques (« Favori » ×20), cœur avant le titre | S |
| A11Y-24 | accessibilité | faible | Révocation d'une clé MCP en un clic, sans confirmation | S |
| A11Y-25 | accessibilité | faible | « Précédent » inactif à 3,47:1, état désactivé non exposé | S |
| A11Y-26 | accessibilité | faible | Libellé visible absent du nom accessible (« Gérer », « Mon compte ») | S |
| A11Y-27 | accessibilité | faible | Recherche de l'accueil en autofocus | S |
| A11Y-28 | accessibilité | faible | Annonce MCP modale qui prend le focus au bout de 0,9 s | S |
| A11Y-29 | accessibilité | faible | Plein écran de repli du lecteur sans confinement du focus | S |
| A11Y-30 | accessibilité | faible | Rôles ARIA incomplets (radiogroup sans flèches, aria-pressed doublé) | S |
| A11Y-31 | accessibilité | faible | Passages surlignés distingués par la seule couleur | S |
| A11Y-32 | accessibilité | faible | prefers-reduced-motion ignoré par les primitives et quelques animations | S |
| A11Y-34 | accessibilité | faible | « Lire la suite » sans effet au lecteur d'écran, aria-controls absent | S |
| A11Y-35 | accessibilité | faible | Liens en nouvel onglet non signalés (21 sur 23) | S |
| A11Y-36 | accessibilité | faible | Titre de la page 404 identique à celui de l'accueil | S |
| A11Y-37 | accessibilité | faible | Page thème : fil d'Ariane sans nav, sujet actif sans état exposé | S |
| A11Y-38 | accessibilité | faible | 55 tailles de texte fixées en px, dont 10 et 11 px | S |
| A11Y-39 | accessibilité | faible | Bouton de thème : nom et icône faux en sombre jusqu'à l'hydratation | S |
| A11Y-40 | accessibilité | faible | Impossible de revenir au thème du système | S |
| NEW-12 | accessibilité | faible | Champs en 14–15 px sur mobile : zoom iOS à la saisie | S |
| QUAL-01 | qualité | moyenne | Le filtre « Toutes les sources » ne fait rien | S |
| QUAL-02 | qualité | moyenne | Deux implémentations divergentes de l'APA et du BibTeX | M |
| QUAL-03 | qualité | moyenne | Aucune frontière d'erreur : page d'erreur Next en anglais sans navigation | S |
| QUAL-04 | qualité | moyenne | Erreurs serveur avalées sans trace, pannes affichées comme états normaux | M |
| QUAL-19 | qualité | moyenne | Aucun test automatisé (connu) : chiffrage et priorités | M |
| NEW-1 | qualité | moyenne | Articles rétractés non signalés hors de la fiche (suggestions, MCP, favoris) | M |
| NEW-5 | qualité | moyenne | Note d'article : dernière saisie perdue, sauvegardes dans le désordre | S |
| QUAL-05 | qualité | faible | Garde-fous des routes API recopiés à la main, avec des trous | M |
| QUAL-06 | qualité | faible | createdAt écrasé à chaque connexion : « Membre depuis » faux | S |
| QUAL-07 | qualité | faible | Variables d'environnement non validées (AI_PROVIDER mal saisi) | S |
| QUAL-08 | qualité | faible | Clés BibTeX vides pour les articles non latins sans année | S |
| QUAL-09 | qualité | faible | localStorage relu sans validation : accueil inutilisable si corrompu | S |
| QUAL-10 | qualité | faible | Pas de client HTTP commun, trois jsonOrError divergents | M |
| QUAL-11 | qualité | faible | Décodage Firestore dupliqué (instantané ×4, Timestamp ×9) | S |
| QUAL-12 | qualité | faible | favorites-provider.tsx monolithique (478 lignes) | M |
| QUAL-13 | qualité | faible | Blocs d'interface recopiés, code mort dans WorkCard | M |
| QUAL-14 | qualité | faible | Identifiants validés par 5 à 6 regex différentes | S |
| QUAL-15 | qualité | faible | Frontière serveur/client floue : openalex.ts et ai.ts sans server-only | M |
| QUAL-16 | qualité | faible | Métadonnées des fiches streamées dans le body (SEO 90) | S |
| QUAL-17 | qualité | faible | Ni robots.txt ni sitemap, recherche interne indexable | S |
| QUAL-18 | qualité | faible | Ni OpenGraph, ni metadataBase, ni canonical | M |
| QUAL-20 | qualité | faible | Pas de CI ni de typecheck, lint plus exécuté (connu) | S |
| QUAL-21 | qualité | faible | /api/summary relance les erreurs inattendues, message technique en anglais | S |
| QUAL-22 | qualité | faible | Branche Anthropic dans la route, erreurs traduites à deux endroits | S |
| QUAL-23 | qualité | faible | Pas de module de compte, suppression orchestrée dans la route | S |
| QUAL-24 | qualité | faible | Constantes métier dupliquées entre client et serveur | S |
| QUAL-25 | qualité | faible | .env.example ignoré par git alors que le README y renvoie | S |
| QUAL-26 | qualité | faible | next-themes mort, CLI shadcn en production, server-only non déclaré | S |
| QUAL-27 | qualité | faible | Types Node 20 pour un runtime Node 24, pas de champ engines | S |
| QUAL-28 | qualité | faible | Code mort : composants, utils.ts, exports, SVG de create-next-app | S |
| QUAL-29 | qualité | faible | Quatre handlers GET d'API sans appelant | S |
| QUAL-30 | qualité | faible | Utilitaires dupliqués : fold() ×4, dates sans fuseau, cleanText mal rangé | S |
| QUAL-31 | qualité | faible | Accès au stockage local recopié, règle set-state-in-effect désactivée | S |
| QUAL-32 | qualité | faible | cleanText colle les mots séparés par une tabulation, casse les émojis | S |
| QUAL-33 | qualité | faible | Déconnexion : réponse non vérifiée, logique en double | S |
| QUAL-34 | qualité | faible | Sonde HEAD « Lire le PDF » en 404 : erreur dans la console | S |
| QUAL-35 | qualité | faible | Le 401 du MCP annonce des métadonnées OAuth en 404 | S |
| QUAL-36 | qualité | faible | Soft 404 : article introuvable en 200 à cause du loading.tsx | S |
| QUAL-37 | qualité | faible | lastUsedAt écrit sans attente dans une fonction serverless | S |
| QUAL-38 | qualité | faible | Nommage incohérent : collections/listes, highlights/citations | S |
| QUAL-39 | qualité | faible | Logique métier dans les pages et le MCP (articles proches divergents) | S |
| QUAL-40 | qualité | faible | pdf-reader.tsx : trois composants et un événement window global | M |
| QUAL-41 | qualité | faible | openalex.ts : trois copies de « récupérer par identifiants » | S |
| QUAL-42 | qualité | faible | README et AGENTS.md en retard sur le produit | S |
| QUAL-43 | qualité | faible | Aucun contrôle d'accessibilité automatisé (connu) | M |
| NEW-6 | qualité | faible | Repli par redirection de la connexion qui échoue en silence | S |
| NEW-7 | qualité | faible | MCP : quota dépassé ou panne Firestore répondent « invalid_token » (401) | S |
| NEW-8 | qualité | faible | « Annuler » après retrait d'un favori : date et place dans les listes perdues | M |
| NEW-11 | qualité | faible | Tri « Les plus votés » limité aux 300 sujets récents | S |
| NEW-13 | qualité | faible | Dépôt public sans licence | S |

Répartition : 145 constats, dont 2 élevés, 31 moyens et 112 faibles ; aucun critique. Par axe : sécurité 25, performance 29, accessibilité 41, qualité 50.

## 4. Constats détaillés

Chaque constat indique sa sévérité (réajustée après vérification), son effort (S < 1 h, M < 1 j, L > 1 j) et le verdict de la vérification contradictoire. Les décisions déjà connues sont signalées « connu ».

### 4.1 Sécurité

#### SEC-01 — /liste/[token] : jusqu'à ~2 000 lectures Firestore par vue anonyme (double chargement, paquets en série, ni cache ni limite)

- **Sévérité** : moyenne (critique si le projet est en plan Spark, à vérifier) · **Effort** : M · **Vérification** : partiel
- **Emplacement** : `src/app/liste/[token]/page.tsx:13,19-37` ; `src/lib/shares.ts:53-88`
- **Preuve** : `export const dynamic = "force-dynamic"`. `load(token)` (l.19) est appelé par `generateMetadata` (l.25) puis par la page (l.36), sans `cache()` de React ; le SDK Admin n'est pas dédupliqué comme `fetch`. `getSharedList` lit `shares/{token}`, la liste, puis `db.getAll` par paquets de 100 dans une boucle `for … await` (shares.ts:66-69), avec N ≤ `MAX_FAVORITES` = 1000. En production, `GET /liste/…` renvoie `cache-control: private, no-cache, no-store`, `x-vercel-cache: MISS`, `x-vercel-id cdg1::iad1`. Aucun `rateLimit`, aucune authentification.
- **Impact** : un compte gratuit remplit une liste de 1 000 faux articles en ~11 min (`sanitizeSnapshot` ne vérifie pas l'existence sur OpenAlex), la partage, puis enchaîne des GET anonymes : 2 × 1 002 lectures et 12 allers-retours en série par vue. À 50 req/s, ~100 000 lectures/s, soit ~100 à 215 $/h en Blaze. En Spark, le quota de 50 000 lectures/jour tombe en ~25 vues et favoris, listes et citations tombent pour tous. Une liste réelle de 10 articles ne coûte que 24 lectures : c'est un risque d'amplification volontaire (« denial of wallet »), pas une fuite.
- **Recommandation** :
  1. (S) Dédupliquer : `import { cache } from "react";` puis `const load = cache(async (token: string) => { if (!SHARE_TOKEN.test(token)) return null; return getSharedList(token).catch(() => null); });` Lectures divisées par 2.
  2. (S) Paralléliser les paquets dans `shares.ts:65-69` : découper en `chunks` de 100, `await Promise.all(chunks.map((c) => db.getAll(...c.map((id) => favorites.doc(id)))))`, puis aplatir dans l'ordre. Réduit la latence, pas les lectures.
  3. (S) Plafonner par IP en tête de page : `` const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]; if (!rateLimit(`share-view:${ip}`, 30, 60_000)) notFound(); ``. Même garde sur `src/app/retours/page.tsx`. Compléter par une règle de limitation du pare-feu Vercel sur `/liste/*` et `/retours` (60 req/min/IP), car la limite en mémoire n'est pas globale (connu).
  4. (M) Mettre en cache : `unstable_cache(fn, ["share", token], { tags: ["share:" + token], revalidate: 300 })` et appeler `revalidateTag("share:" + token)` dans tous les chemins d'écriture (revokeShare, createShare, deleteCollection, updateCollection, addToCollection, removeFromCollection, removeFavorite, suppression de compte). Sans cela, un lien révoqué resterait lisible 5 min. Ne pas dénormaliser toute la liste dans `shares/{token}` : 1 000 instantanés peuvent dépasser la limite de 1 Mio d'un document.
  5. (S à M) Paginer l'affichage par 100 avec « Voir plus ».
  6. Vérifier le plan Firebase de `sextant-ba71a` (console > Utilisation et facturation) ; en Blaze, poser une alerte de budget GCP.
- **Verdict** : partiel. Mécanisme confirmé dans le code et par les en-têtes de production, calculs cohérents (~100 $/h est plutôt un minimum). Corrections : 12 allers-retours et non ~10 ; l'impact suppose une liste remplie par un attaquant ; la dénormalisation proposée à l'origine ne tient pas ; `/retours` porte le même risque en plus faible. Plan Firebase et pare-feu Vercel non vérifiables (CLI 401, API 403).

#### SEC-02 — /api/summary : appel LLM anonyme sans limite de débit, sans contrôle d'origine ni borne de taille, et cache mémoire non borné

- **Sévérité** : moyenne · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/api/summary/route.ts:10,20-69` ; `src/lib/ai.ts:71-87`
- **Preuve** : le POST enchaîne `activeProvider()` → `req.json()` → `/^W\d+$/i` → `getWork` → appel au fournisseur, sans `getCurrentUser`, `rateLimit`, `rejectCrossSite` ni `rejectLargeBody`. C'est la seule route coûteuse absente du grep `rejectCrossSite|rejectLargeBody|rateLimit` (`/api/pdf` et `/api/recommendations` limitent à 30/min/IP). `req.json()` accepte un corps `text/plain`, donc une requête simple sans préflight CORS. `const cache = new Map()` (l.10) n'a pas d'éviction ; la clé n'est pas normalisée (`w123` ≠ `W123`). Le repli de modèle vaut `claude-opus-5` si `AI_PROVIDER` bascule sur Anthropic (ai.ts:52). En production, la fiche affiche « Par Mistral AI » et le bouton aux anonymes (article/[id]/page.tsx:199).
- **Impact** : un script qui parcourt des identifiants W distincts épuise le quota gratuit Mistral, et « Quota gratuit atteint » (429, ai.ts:89) s'affiche pour tous. N'importe quel site peut faire émettre ces POST par ses visiteurs. Chaque identifiant inédit consomme aussi un appel OpenAlex signé. Coût financier aujourd'hui hypothétique (offre gratuite) ; mémoire bornée en pratique par le débit du fournisseur.
- **Recommandation** :
  1. En tête du POST : `const refused = rejectCrossSite(req) ?? rejectLargeBody(req, 1_024); if (refused) return refused;` et refus 415 si le `content-type` n'est pas `application/json`.
  2. Remplacer la regex l.32 par `/^W\d{1,12}$/i`, puis `id = id.toUpperCase()` avant de construire `cacheKey`.
  3. Après la lecture du cache (l.39), avant `getWork` (l.41) : `` const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon"; if (!rateLimit(`summary:${ip}`, 10, 60_000)) return NextResponse.json({ error: "Trop de requêtes, réessayez dans une minute." }, { status: 429 }); ``
  4. Borner le cache : avant `cache.set` (l.60), `if (cache.size >= 500) cache.delete(cache.keys().next().value!);`.
  5. Protection globale à trancher : règle Vercel Firewall sur `/api/summary`, ou réserver le condensé aux sessions avec un quota par uid (décision produit).
  6. `ai.ts:52` : remplacer le repli `claude-opus-5` par un modèle économique, ou exiger `AI_MODEL`.
- **Verdict** : partiel. Absence de garde confirmée et risque actif en production. Exagérés : le coût financier (Mistral gratuit), la mémoire « sans limite », la borne de taille (Vercel plafonne à 4,5 Mo). Impact réel : déni de service d'une fonction secondaire. Voir aussi l'alerte `AI_MODEL` en synthèse.

#### SEC-07 — Amplification des lectures Firestore par un compte gratuit : les outils MCP et deux GET d'API lisent toute la bibliothèque

- **Sévérité** : moyenne · **Effort** : M · **Vérification** : partiel
- **Emplacement** : `src/lib/mcp-tools.ts:155,188,213` ; `src/app/api/mcp/route.ts:31` ; `src/lib/highlights.ts:41-49` ; `src/app/api/favorites/route.ts:30` ; `src/app/api/highlights/route.ts:15`
- **Preuve** : `get_my_citations` appelle `listHighlights(uid)`, qui lit jusqu'à `MAX_HIGHLIGHTS` = 2 000 documents puis filtre en mémoire, même avec `limit: 1`. `get_my_favorites` lit 1 000 favoris puis `.slice(0, limit ?? 30)`. `get_list` lit toutes les listes et tous les favoris pour en afficher une. `verifyKey` ajoute 1 lecture. La limite MCP est de 240/min par clé (5 clés possibles), par instance. Côté API : `GET /api/highlights` (2 000 lectures, 90/min) et `GET /api/favorites?full=1` (1 000 lectures), sans appelant (QUAL-29). Pages non limitées : `/citations` (jusqu'à 2 050 lectures par rendu), `/favoris` (1 050).
- **Impact** : jusqu'à ~2,4 M lectures/min par instance pour un compte rempli aux plafonds (~50 $/h, ou quota épuisé pour tous en Spark). Même sans malveillance, un compte à 2 000 citations interrogé 25 fois par jour consomme 50 000 lectures. Un utilisateur réel à 100 citations consomme ~2 500 lectures/jour.
- **Recommandation** :
  1. (S) `src/lib/highlights.ts` : ajouter `listRecentHighlights(uid, n)` avec `col.orderBy("createdAt", "desc").limit(n)`, et pour un article `where("workId", "==", w).limit(200)`.
  2. (S) `src/lib/favorites.ts` : `listFavorites(uid, max = MAX_FAVORITES)` avec `.limit(max)`, et un helper `getFavoritesByIds(uid, ids)` (`db.getAll` par 100) réutilisé par shares.ts.
  3. (S à M) `mcp-tools.ts` : sans `query`, lire seulement `limit ?? 30` éléments et le total via `countFavorites` ; avec `query`, parcourir par pages de 200 (`startAfter`) jusqu'à `limit` résultats ; `get_list` lit un seul document de liste puis `getFavoritesByIds`.
  4. (S) `mcp/route.ts:31` : limiter par uid, `` rateLimit(`mcp:${found.uid}`, 60, 60_000) ``.
  5. (S à M, prioritaire) `/citations` et `/favoris` : `` rateLimit(`page-lib:${user.uid}`, 30, 60_000) `` ou affichage des 200 premiers avec « voir plus » ; `/liste/[token]` : voir SEC-01.
  6. (S) Supprimer la branche `?full=1` et le `GET` de `/api/highlights` (QUAL-29).
  7. Alerte de budget GCP et vérification du plan Firebase.
- **Verdict** : partiel. Mécanisme confirmé ; chiffres maximaux exacts mais théoriques (compte aux plafonds, 20 req/s par instance). Les vecteurs les plus exposés sont les pages `/citations`, `/favoris` et `/liste`, sans aucune limite. La limitation en mémoire par instance reste un choix connu ; le risque nouveau est le facteur 2 000 lectures par requête.

#### SEC-03 — Aucun en-tête de sécurité applicatif (CSP, frame-ancestors/X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP) et x-powered-by exposé

- **Sévérité** : faible · **Effort** : M · **Vérification** : partiel
- **Emplacement** : `next.config.ts:3-17` (ni `headers()` ni `poweredByHeader: false`) ; pas de `src/proxy.ts`
- **Preuve** : `curl -D -` en production sur `/`, `/retours`, `/article/W2741809807`, `/liste/…` : seuls `strict-transport-security` et `x-powered-by: Next.js`. Lighthouse sur les 11 rapports : « No CSP found in enforcement mode », « No frame control policy found », « No COOP header found ». Seul `/api/pdf` pose déjà `nosniff` (route.ts:64-69).
- **Impact** : aucune défense en profondeur contre une XSS future (qui pourrait créer une clé MCP en same-origin et l'exfiltrer). Pages encadrables par n'importe quel site (habillage de phishing). Le clickjacking des actions connectées est neutralisé en pratique par SameSite=Lax. Pile technique divulguée.
- **Recommandation** :
  - Étape 1 (S) dans `next.config.ts` : `poweredByHeader: false` et `async headers() { return [{ source: "/((?!__/auth/).*)", headers: [...] }] }` avec `X-Frame-Options: SAMEORIGIN`, `Content-Security-Policy: frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src https:`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()`, `Cross-Origin-Opener-Policy: same-origin-allow-popups`. SAMEORIGIN plutôt que DENY pour ne pas casser l'iframe `/__/auth/iframe` si le domaine d'auth propre est activé ; `object-src https:` pour le repli `<object>` du lecteur. Tester connexion popup et redirection, lecteur PDF et repli sur un aperçu.
  - Étape 2 (M) : CSP stricte à nonce via `src/proxy.ts`, d'abord en `Content-Security-Policy-Report-Only` (`script-src 'self' 'nonce-X' 'strict-dynamic' https://apis.google.com`, `connect-src` Identity Toolkit, `img-src 'self' data: https://lh3.googleusercontent.com`, `frame-src` firebaseapp.com et accounts.google.com, `worker-src 'self' blob:`). Passer le nonce au `<script>` de THEME_SCRIPT (layout.tsx) pour éviter le flash du thème. Toutes les pages sont déjà dynamiques, donc pas de coût de rendu.
- **Verdict** : partiel. En-têtes absents confirmés. Aucun point d'injection XSS actuel (seul `dangerouslySetInnerHTML` constant, React 19 neutralise `javascript:`), clickjacking neutralisé par SameSite=Lax : sévérité ramenée à faible. La recommandation initiale (DENY sur `/__/auth/*`, CSP sans nonce pour THEME_SCRIPT) aurait cassé la connexion ou le thème.

#### SEC-04 — Routes publiques sans aucune limite de débit qui consomment OpenAlex, Firestore et du temps de fonction : /api/suggest, /api/author, HEAD /api/pdf, échecs de /api/mcp

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/api/suggest/route.ts:20-41` ; `src/app/api/author/route.ts:5-17` ; `src/app/api/pdf/route.ts:79-89` (HEAD) ; `src/app/api/mcp/route.ts:26-31`
- **Preuve** : suggest et author n'ont aucun `rateLimit` ; `q` n'a pas de longueur maximale et `withCredentials` ajoute l'`api_key` OpenAlex. HEAD `/api/pdf` n'a pas de limite alors que le GET en a une (l.25, 30/min) : chaque identifiant inédit coûte `getWork` et jusqu'à 5 fetch amont de 12 s dans un budget de 25 à 40 s. Dans `/api/mcp`, `rateLimit` n'intervient qu'après `verifyKey` : chaque fausse clé bien formée coûte une lecture Firestore. Mesures : HEAD `/api/pdf?work=W2741809807` en HIT (0,09 s) ; `/api/suggest` en MISS avec `public, max-age=300` sans `s-maxage`.
- **Impact** : risque d'épuisement du budget quotidien de la clé OpenAlex, durée de fonction facturée, requêtes massives vers des hébergeurs tiers depuis les IP Vercel. Distinct du choix connu (limite en mémoire par instance) : ici, il n'y a aucune limite. Le principal vecteur OpenAlex reste toutefois les pages rendues côté serveur (`/search`, `/article`, `/theme`).
- **Recommandation** :
  1. (S, seule protection réellement globale) Vercel > Firewall > règle de limitation par IP (par exemple 120 req/min, action 429) sur `/search`, `/article/*`, `/theme/*`, `/api/suggest`, `/api/author`, `/api/pdf`, `/api/mcp`, d'abord en mode « log ».
  2. (S) Helper `clientIp(req)` dans `src/lib/rate-limit.ts`, réutilisé par pdf (l.24 et l.80) et recommendations. Dans le HEAD, après la validation `WORK_ID` : `` if (!rateLimit(`pdf-head:${clientIp(req)}`, 60, 60_000)) return new Response(null, { status: 429 }); ``
  3. (S) `mcp/route.ts` : avant `verifyKey`, `` if (!rateLimit(`mcp-ip:${ip}`, 300, 60_000)) `` avec réponse 429 explicite (voir NEW-7).
  4. (S, optionnel) suggest et author : `rateLimit` par IP (120/min), `q.slice(0, 200)`, `s-maxage=300` sur suggest.
  5. Ne pas modifier `read-pdf-button.tsx` : la sonde est déjà servie par le CDN.
- **Verdict** : partiel. Faits confirmés ; exposition mal localisée (les pages SSR sont le vecteur principal) ; une limite en mémoire n'arrête pas un attaquant qui change d'IP ; volet MCP d'impact négligeable (clé de 256 bits). Seule l'asymétrie GET/HEAD sur `/api/pdf` est spécifique.

#### SEC-05 — SSRF résiduel dans le relais PDF : redirections intermédiaires non validées et filtre par nom d'hôte contournable (point final, DNS joker)

- **Sévérité** : faible · **Effort** : M · **Vérification** : partiel
- **Emplacement** : `src/app/api/pdf/route.ts:102-110` ; `src/lib/format.ts:57-70`
- **Preuve** : `fetch(url, { redirect: "follow" })` suit jusqu'à 20 redirections ; seules l'URL initiale et `upstream.url` passent par `isPublicPdfUrl`, qui ne regarde que le nom d'hôte, sans résolution DNS. Test node : `isPublicPdfUrl("http://localhost./x.pdf")`, `("http://127.0.0.1.nip.io/x.pdf")`, `("http://metadata.google.internal./x")` renvoient `true`. Test local sous Node 24 : un 302 vers `http://127.0.0.1:<port>/…` est suivi et le serveur interne reçoit le GET. Le commentaire l.96 promet pourtant que l'hôte final est revalidé.
- **Impact** : condition préalable, un `pdf_url` OpenAlex pointant vers un hôte contrôlé par l'attaquant. La fonction émet alors des GET aveugles vers la boucle locale ; la réponse n'est relayée que si elle commence par `%PDF`. Lambda/Vercel n'a ni IMDS ni réseau privé : impact concret limité, mais la garantie « jamais vers l'intérieur » n'est pas tenue.
- **Recommandation** :
  1. `format.ts:66` : `const h = u.hostname.toLowerCase().replace(/\.+$/, "");` avant les tests, plus `isPublicAddress(ip)` fondée sur `net.BlockList` (0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.168/16, 198.18/15, 224/4, 240/4, ::, ::1, fc00::/7, fe80::/10, ::ffff:0:0/96 revérifié en IPv4).
  2. `route.ts:98-127` : `redirect: "manual"` et boucle de 5 sauts maximum ; à chaque saut, `next = new URL(res.headers.get("location")!, current).href`, revalidation et contrôle DNS ; annuler le corps des 3xx. Corriger le commentaire l.96.
  3. Contrôle DNS : `undici` en dépendance directe et `new Agent({ connect: { lookup } })` qui refuse toute adresse non publique, passé en `dispatcher` ; à défaut, `dns.promises.lookup(host, { all: true })` à chaque saut (fenêtre TOCTOU acceptable ici).
  4. `rateLimit` sur le HEAD (SEC-04).
  5. Tests unitaires (`localhost.`, `x.internal.`, `127.0.0.1.nip.io`, `2130706433`, `[::ffff:127.0.0.1]`, port 9001, redirection vers 127.0.0.1), rattachés à QUAL-19.
- **Verdict** : partiel. Mécanisme vérifié par exécution ; aucun saut n'est validé avant l'envoi. Risque surévalué (aveugle, dépend d'OpenAlex, pas d'IMDS) : sévérité faible, mais correctif utile en défense en profondeur.

#### SEC-06 — Métadonnées d'article fournies par le client stockées telles quelles : falsification sur les listes publiques et injection de prompt indirecte via le MCP

- **Sévérité** : faible · **Effort** : M · **Vérification** : partiel
- **Emplacement** : `src/lib/favorites-shared.ts:52-72` ; `src/app/api/favorites/route.ts:54` ; `src/app/api/collections/[id]/articles/route.ts:37` ; `src/app/liste/[token]/page.tsx:61-72` ; `src/components/favorites/favorites-provider.tsx:82,197-209` ; `src/lib/mcp-tools.ts:49-51,155-159,194-196`
- **Preuve** : `sanitizeSnapshot` vérifie l'id (`W\d+`) et le DOI mais garde title (500), authors (300), venue, topic et authorNames envoyés par le client, seulement tronqués par `clip` (pas de `cleanText` : U+202E passe). Le serveur ne recharge pas l'article depuis OpenAlex. Sur une liste partagée, le cœur recopie l'instantané du propriétaire (`<FavoriteButton snapshot={a} />`), rejoué depuis sessionStorage après connexion. Les outils MCP renvoient `f.title`, `f.authors` et l'APA sans encadrement, et les instructions MCP présentent le contenu comme « vérifié ».
- **Impact** : une page publique peut prêter un titre inventé à un vrai identifiant OpenAlex ; le visiteur qui clique sur le cœur recopie ce texte dans ses favoris, ses exports APA/BibTeX et le contexte de son assistant. Chaîne ciblée (lien reçu, clic volontaire), injection de prompt non propre à ce vecteur (OpenAlex renvoie déjà du texte tiers).
- **Recommandation** :
  1. (S) Reconstruire l'instantané côté serveur dans `api/favorites/route.ts:53` et `api/collections/[id]/articles/route.ts:37` : garder `sanitizeSnapshot(body)` pour valider l'id, puis `const work = await getWork(input.id)` (déjà en cache 1 h) ; 404 si `null`, sinon `snapshotFromWork(work)` ; en cas d'erreur OpenAlex, 502 ou repli sur l'instantané nettoyé.
  2. Remplacer `clip` par `cleanText` pour title, authors, venue, topic et authorNames, après avoir déplacé `cleanText` dans un module neutre (`src/lib/text.ts`) pour éviter un import circulaire.
  3. Appliquer la même reconstruction aux surlignages et notes (priorité moindre).
  4. Facultatif : dans `mcp/route.ts:19-20`, ne plus qualifier la bibliothèque de « vérifiée » et préciser que les textes renvoyés sont des données, pas des consignes.
- **Verdict** : partiel. Mécanisme réel et bien localisé ; usurpation marginale (le propriétaire écrit déjà du texte libre, chaque titre renvoie aux vraies métadonnées), propagation conditionnelle, injection de prompt spéculative.

#### SEC-08 — La déconnexion ne révoque pas la session : un cookie copié reste valable jusqu'à 14 jours

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/api/auth/session/route.ts:67-73` ; `src/lib/auth.ts:8,31`
- **Preuve** : le DELETE fait seulement `res.cookies.set(SESSION_COOKIE, "", { maxAge: 0 })` ; `grep -rn revokeRefreshTokens src` ne trouve rien. `SESSION_MAX_AGE_MS` = 14 jours. `auth.ts:31` vérifie pourtant la révocation (`verifySessionCookie(token, true)`) : une révocation prendrait effet tout de suite. Aucune « déconnexion partout ».
- **Impact** : un cookie récupéré avant la déconnexion (extension malveillante, logiciel local) reste valable 14 jours après « Se déconnecter » : lecture de la bibliothèque, création d'une clé MCP, suppression du compte. Le cookie est HttpOnly, Secure et SameSite=Lax : pas de capture réseau possible.
- **Recommandation** :
  - Dans le DELETE : lire `(await cookies()).get(SESSION_COOKIE)?.value`, puis dans un try/catch qui ignore les erreurs `const { sub } = await auth.verifySessionCookie(token); await auth.revokeRefreshTokens(sub);`, et toujours effacer le cookie.
  - Conséquence à assumer : `revokeRefreshTokens` déconnecte tous les appareils. Soit l'annoncer sous le bouton, soit garder la déconnexion locale et ajouter dans `/compte` un bouton « Se déconnecter de tous les appareils » (nouvel endpoint protégé par `rejectCrossSite` et `getCurrentUser`).
  - Client : vérifier `res.ok` dans `account-actions.tsx:20` (QUAL-33).
  - Avec SEC-09 et SEC-11 : invalider aussi les clés MCP créées avant la révocation.
- **Verdict** : partiel. Faits exacts (la doc Firebase montre `revokeRefreshTokens` à la déconnexion). Le scénario « poste partagé » ne tient pas (le cookie est effacé du navigateur) ; la révocation ne protège que si la victime se déconnecte après le vol, et elle ne coupe pas les clés MCP.

#### SEC-09 — Suppression de compte et création de clé MCP sans ré-authentification récente ni limite de débit

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/api/auth/account/route.ts:11-37` ; `src/app/api/account/keys/route.ts:12,23-43` ; `src/app/api/account/keys/[id]/route.ts:10`
- **Preuve** : seul `getCurrentUser()` est vérifié avant `recursiveDelete(users/{uid})` et `deleteUser(uid)`, comme avant la création d'une clé MCP. Aucun contrôle d'`auth_time`, alors que la session peut dater de 14 jours. La création de clé est en revanche déjà limitée (10/min, 5 clés maximum).
- **Impact** : un cookie volé suffit à détruire un compte ou à créer une clé MCP qui survit à la fin de la session (accès en lecture seule, visible et révocable dans « Mon compte »).
- **Recommandation** :
  1. `src/lib/auth.ts` : ajouter `authTime` (`claims.auth_time`) à `SessionUser` et `isRecentLogin(user, maxAgeSec = 600)`.
  2. Après la l.15 de `auth/account/route.ts` et la l.27 de `account/keys/route.ts` (POST) : `if (!isRecentLogin(user)) return NextResponse.json({ error: "Reconnectez-vous pour confirmer.", code: "reauth_required" }, { status: 401 });`
  3. Client (`account-actions.tsx:34`, `mcp-keys.tsx`) : sur `reauth_required`, relancer `signInWithPopup`, refaire le POST `/api/auth/session` (qui exige déjà `auth_time` < 5 min), vérifier que l'uid est le même, puis rejouer la requête.
  4. Plus prioritaire : révoquer la session à la déconnexion (SEC-08).
  5. La limite de débit sur la suppression de compte n'apporte rien (action unique) ; au mieux `` rateLimit(`account-del:${uid}`, 3, 60_000) `` par hygiène.
- **Verdict** : partiel. Absence de ré-authentification confirmée (écart à OWASP ASVS V3.7.1). Le titre est faux sur la création de clé (déjà limitée) ; prérequis d'un cookie compromis, clé en lecture seule et révocable : sévérité faible.

#### SEC-10 — /api/health public : empreinte de configuration et écho possible d'un extrait du compte de service en cas d'erreur

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/api/health/route.ts:7-25` ; `src/lib/firebase/admin.ts:23`
- **Preuve** : GET en production : booléens `openalexKey`, `mistralKey`, `firebasePublic`, `firebaseServiceAccount`, plus `serviceAccountLength: 2333`, `serviceAccountStartsWithBrace: true`, `node: v24.20.0`, `region: iad1`. En cas d'échec, la route renvoie `e.message.slice(0, 200)` de l'initialisation, qui fait un `JSON.parse(FIREBASE_SERVICE_ACCOUNT)` non protégé. Sous Node 24, V8 cite ~10 caractères de l'entrée pour certaines erreurs structurelles. Pas de `rateLimit` ; aucune référence à la route dans `src/`, `docs/` ni le README (reste de débogage, commit 4e838b4).
- **Impact** : reconnaissance facilitée (runtime, région, fournisseurs actifs, taille du secret). Si la variable est un jour mal collée, un fragment de ~10 caractères peut s'afficher publiquement, jamais le contenu de `private_key`. Aucun secret exposé aujourd'hui.
- **Recommandation** :
  1. Supprimer `src/app/api/health/route.ts` (5 min) : rien ne l'appelle.
  2. Si une sonde est voulue : succès `NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } })` ; échec `console.error("[health] init admin", e)` puis `{ ok: false }` en 503 ; aucun `serviceAccountLength`, `node`, `region` ni `e.message` publics (détail seulement si `VERCEL_ENV !== "production"`).
  3. `admin.ts:23` : `let sa; try { sa = JSON.parse(raw); } catch { throw new Error("FIREBASE_SERVICE_ACCOUNT invalide : JSON illisible."); }`, sans `cause`.
- **Verdict** : partiel. Réponse de production confirmée. Faux : « SDK initialisé à chaque appel » (instance mise en cache au niveau du module). Fuite d'extrait quasi théorique.

#### SEC-11 — Clés MCP toujours valides après la désactivation du compte Firebase, et sans expiration

- **Sévérité** : faible · **Effort** : S · **Vérification** : confirmé
- **Emplacement** : `src/lib/api-keys.ts:55-66` (`verifyKey`)
- **Preuve** : `verifyKey` retrouve `apiKeys/{sha256(clé)}` et renvoie l'uid sans vérifier l'état du compte (`getUser(uid).disabled`). `createKey` n'écrit ni expiration ni date de validité. Le site, lui, vérifie compte désactivé et révocation via `verifySessionCookie(token, true)` (auth.ts:31).
- **Impact** : une clé créée avec une session volée reste valable après la révocation de la session ou la désactivation du compte dans la console. Un compte supprimé depuis la console (sans passer par l'appli) laisse des clés orphelines. Accès borné : 8 outils en lecture seule, bibliothèque du seul propriétaire.
- **Recommandation** :
  1. (S) Après la l.61 : cache mémoire `Map<uid, { ok, validAfter, at }>` de 5 min alimenté par `(await adminAuth()).getUser(uid)` ; renvoyer `null` si `getUser` lève (compte supprimé), si `user.disabled`, ou si `createdAt < Date.parse(user.tokensValidAfterTime)` (clé antérieure à la dernière révocation). Échec fermé dans un try/catch.
  2. (S à M, optionnel) `expiresAt: Timestamp.fromMillis(Date.now() + 180 * 864e5)` dans `createKey`, contrôlé dans `verifyKey` (les clés sans ce champ restent valides), affiché dans `mcp-keys.tsx:123-124`.
- **Verdict** : confirmé. Exact et bien localisé ; impact borné (lecture seule, clés visibles et révocables), d'où la sévérité faible.

#### SEC-12 — Session Firebase du navigateur conservée dans IndexedDB en plus du cookie HttpOnly

- **Sévérité** : faible · **Effort** : S · **Vérification** : confirmé
- **Emplacement** : `src/lib/firebase/client.ts:27-38` ; `src/components/auth/sign-in-dialog.tsx:37-60,95`
- **Preuve** : `getAuth(app)` utilise la persistance par défaut (IndexedDB), aucun `setPersistence` dans `src/`. Après `establishSession`, l'utilisateur Firebase et son jeton de rafraîchissement restent dans `firebaseLocalStorageDb` jusqu'à `signOut`, ce que mentionne la page Confidentialité (l.62). Le serveur n'utilise que le cookie `sextant_session`, et le client ne se sert plus de Firebase Auth après la connexion.
- **Impact** : en cas de XSS, un jeton de rafraîchissement indépendant du cookie HttpOnly peut être exfiltré. Il ne permet pas d'ouvrir une session Sextant (contrôle `auth_time` ≤ 5 min), mais fournit des ID tokens valides pour l'API Identity Toolkit (profil, suppression du compte Firebase). Aucun point d'injection XSS trouvé.
- **Recommandation** :
  1. Dans `sign-in-dialog.tsx`, après chaque échange (popup l.59, redirection l.95) : `try { await establishSession(await credential.user.getIdToken()); } finally { await signOut(auth).catch(() => {}); }`.
  2. Facultatif : `await setPersistence(auth, inMemoryPersistence)` avant `signInWithPopup` (ne couvre pas la redirection).
  3. Purge des utilisateurs existants dans `completeRedirectSignIn` : si pas de résultat, `await auth.authStateReady(); if (auth.currentUser) await signOut(auth);`.
  4. Retirer ensuite la mention correspondante de `src/app/confidentialite/page.tsx:62`.
- **Verdict** : confirmé. Sévérité faible (défense en profondeur) ; la recommandation initiale oubliait la voie redirection.

#### SEC-13 — Contenu public des utilisateurs (listes partagées, « Bugs et idées ») sans signalement ni modération

- **Sévérité** : faible · **Effort** : M · **Vérification** : partiel
- **Emplacement** : `src/app/liste/[token]/page.tsx` ; `src/app/retours/page.tsx` ; `src/lib/feedback.ts`
- **Preuve** : `grep -i "signaler|modér"` ne trouve qu'une adresse de contact dans les mentions légales. Pas de bouton « Signaler » sur `/liste` ni `/retours`, pas de statut de modération (`FeedbackStatus` = open/planned/done/declined), pas de suppression par l'auteur ; `detachAuthor` garde les sujets d'un compte supprimé. `/retours` est indexable (ni robots ni X-Robots-Tag). En production : 0 sujet.
- **Impact** : du contenu public est hébergé sous le domaine sans mécanisme de notification clairement présenté, alors que le DSA (art. 16) en impose un à tout hébergeur. Le retrait reste possible immédiatement depuis la console Firebase (pages en `force-dynamic`).
- **Recommandation** (S pour 1 à 4) :
  1. `src/app/mentions-legales/page.tsx` (l.27-31) : bloc « Signaler un contenu illicite (DSA art. 16) » avec `id="signaler"`, l'adresse `SITE.contactEmail` et les éléments attendus (URL, motif, coordonnées, bonne foi).
  2. `liste/[token]/page.tsx` (l.83-86) : lien « Signaler cette liste » vers `mailto:${SITE.contactEmail}?subject=Signalement liste ${token}`.
  3. `feedback-board.tsx` : lien « Signaler un sujet » à côté de la mention « Les sujets sont publics… ».
  4. `conditions/page.tsx` : couvrir les sujets « Bugs et idées » et le droit de retrait de l'éditeur (DSA art. 14).
  5. Documenter la procédure de retrait (suppression de `feedback/{id}` ou `shares/{token}`) dans `docs/handoffs`.
  6. (M, facultatif) Route DELETE `/api/feedback/[id]` réservée à l'auteur ; `robots: { index: false }` sur `/retours` à trancher.
- **Verdict** : partiel. Absence de lien et de statut confirmée ; « impossible à retirer » est faux (canal e-mail existant, retrait immédiat en console). Le vrai manque est la visibilité du canal. Surface élargie non signalée : `/retours` indexable et instantanés d'articles fournis par le client sur `/liste` (SEC-06).

#### SEC-14 — Votes « Bugs et idées » gonflables : fournisseur de connexion non restreint et compteurs conservés après suppression du compte

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/api/auth/session/route.ts:30` ; `src/app/api/auth/account/route.ts:26-29` ; `src/lib/feedback.ts:7-8,40-49,74-81`
- **Preuve** : `verifyIdToken` accepte tout fournisseur activé dans le projet (`decoded.firebase.sign_in_provider` non vérifié). À la suppression du compte, `feedbackVotes` est effacé mais les compteurs sont conservés (choix commenté l.7-8) ; `deleteUser` puis reconnexion Google créent un nouvel uid, et toutes les limites par uid repartent à zéro.
- **Impact** : une boucle connexion → vote → suppression du compte (~30 s par vote, automatisable) rend le classement public manipulable avec un seul compte Google. Le volet « autre fournisseur » n'est pas démontré (non vérifiable sans écriture).
- **Recommandation** :
  1. (S à M, prioritaire) Dans `auth/account/route.ts`, avant `recursiveDelete` : lire `users/{uid}/feedbackVotes`, appliquer `FieldValue.increment(-1)` sur chaque `feedback/{id}` via `db.bulkWriter()` qui ignore les NOT_FOUND. Ranger la logique dans `withdrawVotes(uid)` de `feedback.ts` et mettre à jour le commentaire l.7-8.
  2. (S) Après `verifyIdToken` : `if (decoded.firebase?.sign_in_provider !== "google.com") return NextResponse.json({ error: "Connexion Google requise." }, { status: 403 });` et vérifier dans la console que seul Google est activé.
  3. Ne pas conserver de hash d'identité après suppression (donnée pseudonymisée).
- **Verdict** : partiel. La boucle suppression/recréation est le seul vecteur démontré ; le volet fournisseur reste une défense en profondeur conditionnelle.

#### SEC-15 — Chemins et paramètres injectés dans les requêtes OpenAlex : generateMetadata non validé, filtres de recherche bruts

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/article/[id]/page.tsx:52-53` ; `src/app/article/[id]/lire/page.tsx:18-19` ; `src/lib/openalex.ts:191-196,227-237` ; `src/components/results.tsx:21-38`
- **Preuve** : `generateMetadata` appelle `getWork((await params).id)` avant la regex de la page, et `get()` concatène `new URL(BASE + path)`. En production, `GET /article/W2741809807%3Fper-page%3D1` renvoie 200 avec le vrai titre dans `<title>` alors que la page rend notFound ; en local, `/article/W1%2F..%2FW2741809807` renvoie aussi le vrai titre. `parseSearchParams` transmet `topic`, `cites`, `author`, `type`, `lang` sans validation (`type:${p.type || VERIFIED_TYPES}`) : `?type=preprint` contourne le filtre « documents vérifiés ».
- **Impact** : requêtes OpenAlex arbitraires signées avec notre `api_key` (hôte fixe, clé non divulguée) ; pas de capacité nouvelle par rapport à `/search?q=<aléatoire>`. La promesse « vérifiés » ne s'applique qu'au filtre par défaut de la recherche.
- **Recommandation** :
  1. Exporter `WORK_ID = /^W\d{1,15}$/i` et valider avant tout appel dans les deux `generateMetadata` : `if (!WORK_ID.test(id)) return { title: "Article introuvable" };` (idéalement un chargeur `cache()` partagé avec la page).
  2. Encoder les segments : `/works/${encodeURIComponent(shortId(id))}` (getWork l.255), idem getTopic (l.359) et getAuthorProfile (l.417).
  3. `results.tsx:28-36` : `topic` `^T\d+$`, `cites` `^W\d+$`, `author` `^A\d+$`, `type` et `lang` en liste blanche partagée avec `search-filters.tsx` ; ignorer toute valeur hors liste.
  4. Le 200 des fiches introuvables relève de QUAL-36 (loading.tsx).
- **Verdict** : partiel. Faits confirmés ; impact surévalué (hygiène et une requête OpenAlex inutile par URL invalide, pas une vulnérabilité exploitable).

#### SEC-16 — URL externes issues d'OpenAlex rendues sans contrôle de schéma ; le repli `<object>` du lecteur embarque une URL non validée

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/lib/format.ts:45-50,79-81` ; `src/app/article/[id]/page.tsx:137,147,152,157` ; `src/components/author-chip.tsx:103` ; `src/app/article/[id]/lire/page.tsx:48` → `src/components/highlights/pdf-reader.tsx:291`
- **Preuve** : `openAccessUrl()` et `publisherUrl()` renvoient `pdf_url`, `landing_page_url` et `doi` tels quels (idem `homepage_url`, openalex.ts:435). `isPublicPdfUrl` ne s'applique qu'aux candidats du relais. Quand le relais échoue, le lecteur passe `oa.url` à `<object data={originalUrl} type="application/pdf">` sans sandbox ; la garde de lire/page.tsx:31 vérifie seulement qu'un candidat est public, pas celui-là.
- **Impact** : pas de XSS (React 19 neutralise `javascript:`, y compris dans `<object data>`). Un `pdf_url` vers une page HTML ou un hôte douteux s'affiche au milieu de la page Sextant ; une URL en `http:` donne un cadre vide. Exposition limitée : la sonde HEAD renvoie déjà vers un lien externe en cas d'échec, et beaucoup d'hébergeurs interdisent l'encadrement.
- **Recommandation** :
  1. `lire/page.tsx` : `const embedUrl = openAccessPdfUrls(work).find((u) => new URL(u).protocol === "https:") ?? null;`, passer `originalUrl={embedUrl ?? oa.url}` et `embeddable={Boolean(embedUrl)}`.
  2. `pdf-reader.tsx:291` : ne rendre `<object>` que si `embeddable`, sinon garder l'encadré et le lien « Ouvrir le PDF dans un nouvel onglet ». Pas de `sandbox` (Chrome n'affiche pas de PDF sandboxé).
  3. Facultatif : `safeHttpUrl()` dans `format.ts` (https/http seulement, sans identifiants) appliqué à `openAccessUrl`, `publisherUrl` et `homepage`.
  4. Avec SEC-03 : `object-src https:` et non `'none'`.
- **Verdict** : partiel. Seule la partie `<object>` a un impact concret, et il est étroit ; le volet `href` est théorique.

#### SEC-17 — Contrôle de taille du corps contournable (chunked) et absent sur /api/auth/session et /api/summary

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/lib/security.ts:24-27` ; `src/app/api/auth/session/route.ts:16-26` ; `src/app/api/summary/route.ts:26-31`
- **Preuve** : `rejectLargeBody` ne lit que l'en-tête `content-length` (absent, `NaN` ou négatif → accepté). `/api/auth/session` et `/api/summary` (POST) n'ont aucun contrôle de taille ; les 9 autres routes qui lisent un corps en ont un. Seul plafond : 4,5 Mo de Vercel.
- **Impact** : mesure locale, 25 à 50 ms de CPU pour 4,4 Mo de JSON ; l'attaquant envoie lui-même 4,4 Mo par requête, rien n'est conservé ni appelé en aval. Risque quasi nul.
- **Recommandation** :
  1. `session/route.ts:17` : `const refused = rejectCrossSite(req) ?? rejectLargeBody(req, 8_192);`
  2. `summary/route.ts` : `rejectCrossSite(req) ?? rejectLargeBody(req, 1_024)` plus la limite de débit de SEC-02.
  3. Optionnel dans `security.ts:25` : 411/413 si `content-length` est absent et `transfer-encoding` présent, à valider d'abord sur un aperçu Vercel.
  4. Retirer `feedback/[id]/vote/route.ts:10` de l'emplacement : cette route ne lit pas de corps.
- **Verdict** : partiel. Faits vrais, une adresse fausse, contournement « chunked » non vérifiable en production sans POST.

#### SEC-18 — « Pour vous » : historique de lecture et favoris transmis dans l'URL d'un GET mis en cache public

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/components/for-you.tsx:38-39` ; `src/app/api/recommendations/route.ts:36-40` ; `src/lib/recent.ts:1` ; `src/app/confidentialite/page.tsx:31-36`
- **Preuve** : `` fetch(`/api/recommendations?${q}`) `` transmet `seen`, `fav` et `hide` (jusqu'à 242 identifiants) en paramètres d'URL ; la réponse porte `public, max-age=300, s-maxage=3600`. Mesure : MISS puis HIT au second appel à l'URL exacte. La politique affirme que ces identifiants « ne sont pas conservés » et `recent.ts:1` dit « aucun envoi serveur ».
- **Impact** : les identifiants consultés figurent dans les journaux de l'hébergeur (déjà déclarés l.85-87 de la politique) et dans les clés du cache CDN pendant 1 h ; aucune fuite entre utilisateurs (la réponse ne dépend que de l'URL). C'est surtout un écart de formulation RGPD et un commentaire périmé. Le cache CDN n'apporte presque rien (URL propre à chaque utilisateur).
- **Recommandation** :
  1. `route.ts:40` : `{ "cache-control": "private, max-age=300" }` et ajuster le commentaire l.31-32.
  2. `recent.ts:1` : « Historique local (localStorage) ; les identifiants sont envoyés à /api/recommendations pour « Pour vous », sans stockage applicatif ».
  3. `confidentialite/page.tsx:34-36` : citer aussi les suggestions écartées et écrire « ne sont pas enregistrés par Sextant ; comme toute adresse demandée, ils peuvent figurer dans les journaux techniques de l'hébergeur ». Nuancer la l.31.
  4. Optionnel : passer en POST avec `rejectLargeBody(req, 8_192)` et `no-store` (perte du cache navigateur).
- **Verdict** : partiel. Faits exacts ; la politique mentionne déjà les journaux ; impact de sécurité quasi nul.

#### SEC-19 — Notes sans plafond de nombre ; export RGPD tronqué à 2 000 notes sans avertissement

- **Sévérité** : faible · **Effort** : S · **Vérification** : confirmé
- **Emplacement** : `src/lib/notes.ts:49-58` ; `src/app/api/account/export/route.ts:28`
- **Preuve** : `setNote` fait `ref.set(..., { merge: true })` sans compter les notes, alors que favoris (1 000), listes (50) et surlignages (2 000) sont plafonnés en transaction. N'importe quel `W\d{1,31}` crée un document (4 000 caractères plus un instantané, ~11 Ko). L'export appelle `listNotes(user.uid, 2000)` ; `/compte` affiche pourtant le vrai total (`countNotes`, page.tsx:39,68) et promet que l'export contient les notes (l.85).
- **Impact** : stockage non borné par compte (90 écritures/min et par instance, ~130 000 documents/jour possibles). Au-delà de 2 000 notes, l'export au titre des articles 15 et 20 du RGPD est incomplet sans que l'utilisateur le sache. Cas limite pour un usage normal.
- **Recommandation** :
  1. `src/lib/notes-shared.ts` : `export const MAX_NOTES = 2000;`.
  2. `notes.ts` : `NotesLimitError` et transaction qui ne compte que si la note n'existe pas encore :
     ```ts
     await db.runTransaction(async (tx) => {
       const cur = await tx.get(ref);
       if (!cur.exists) {
         const n = (await tx.get(db.collection(`users/${uid}/notes`).count())).data().count;
         if (n >= MAX_NOTES) throw new NotesLimitError(`Limite de ${MAX_NOTES} notes atteinte.`);
       }
       tx.set(ref, {...}, { merge: true });
     });
     ```
  3. `api/notes/[workId]/route.ts:56` : 409 sur `NotesLimitError`.
  4. Export : `listAllNotes(uid)` paginé par 500 (`orderBy("updatedAt","desc").startAfter`), ou au minimum `notesTruncated: countNotes(uid) > notes.length`. Même principe pour favoris et surlignages.
- **Verdict** : confirmé. Sévérité faible (connexion requise, coût modeste).

#### SEC-21 — 8 vulnérabilités modérées transitives (uuid < 11.1.1) via firebase-admin 13

- **Sévérité** : faible · **Effort** : M · **Vérification** : partiel
- **Emplacement** : `package.json` (firebase-admin ^13.10.0)
- **Preuve** : `npm audit --omit=dev` : 8 modérées, toutes issues d'un seul avis (GHSA-w5hq-g745-h8pq, uuid@9.0.1) compté une fois par paquet de la chaîne (google-gax 4.6.1, gaxios 6.7.1, teeny-request 9.0.0, @google-cloud/storage, @google-cloud/firestore, firebase-admin). `fixAvailable` : firebase-admin 14.5.0, version majeure. Aucun appelant n'utilise uuid v3/v5/v6 ni le paramètre `buf` : seuls des `v4()` (google-gax util.js:108, gaxios.js:417, teeny-request index.js:135).
- **Impact** : non exploitable ici. Bruit dans `npm audit` qui masquera de futures alertes réelles, et dette de version majeure.
- **Recommandation** :
  - Immédiat (S) : dans `package.json`, `"overrides": { "uuid": "^11.1.1" }`, puis `npm install` sur une branche ; vérifier `npm ls uuid` (11.1.1 seul) et `npm audit --omit=dev` (0) ; tester un appel Firestore et une connexion. uuid 11 reste compatible `require`.
  - Plus tard (M) : firebase-admin ^14.5.0, qui exige Node ≥ 22 ; ajouter `"engines": { "node": ">=22" }` (voir QUAL-27) et tester `verifySessionCookie`, `recursiveDelete` et les transactions.
  - Ne jamais lancer `npm audit fix --force`.
  - Ajouter `.github/dependabot.yml` (npm, hebdomadaire, montées majeures de firebase-admin groupées ou ignorées) ; Dependabot fonctionne sans CI.
- **Verdict** : partiel. Faits exacts, « 8 vulnérabilités » trompeur (un seul avis), risque réel nul ; une solution sans montée majeure existait.

#### SEC-22 — Instructions de branchement MCP : mcp-remote non épinglé et clé en clair dans la commande du terminal

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/components/account/mcp-keys.tsx:188,192`
- **Preuve** : configuration Claude Desktop proposée : `{ command: "npx", args: ["-y", "mcp-remote", …] }` sans version. Commande Claude Code : `claude mcp add --transport http sextant ${endpoint} --header "Authorization: Bearer ${created.key}"`. mcp-remote avant 0.1.16 est vulnérable à CVE-2025-6514.
- **Impact** : la clé complète finit dans `~/.zsh_history` (deuxième copie locale, `claude mcp add` la stockant déjà dans `~/.claude.json`). Volet CVE théorique : Sextant ne publie aucune métadonnée OAuth, et npm récent revérifie la version en ligne (`preferOnline`).
- **Recommandation** :
  1. l.188 : faire saisir la clé en masqué, compatible bash et zsh : `printf 'Clé : '; read -rs SEXTANT_KEY; echo; claude mcp add --transport http sextant ${endpoint} --header "Authorization: Bearer $SEXTANT_KEY"; unset SEXTANT_KEY`. Garder les guillemets doubles (avec des simples, l'en-tête vaudrait littéralement `$SEXTANT_KEY`). Ajouter une ligne d'aide et rappeler que la révocation reste le vrai garde-fou.
  2. l.192 (facultatif) : `mcp-remote@latest` ; ne pas épingler de version exacte.
  3. Rien à faire sur le connecteur natif, déjà présenté en premier.
- **Verdict** : partiel. Seul le point d'hygiène de l'historique reste ; la recommandation initiale à guillemets simples était fausse.

#### NEW-2 — Export RGPD incomplet et inventaire inexact sur « Mon compte » : sujets publiés, votes et date de dernière connexion absents

- **Sévérité** : faible (conformité plus que sécurité) · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/api/account/export/route.ts:23-49` ; `src/lib/feedback.ts:45-46,58` ; `src/app/api/auth/session/route.ts:47` ; `src/app/compte/page.tsx:84-85` ; `src/app/confidentialite/page.tsx:40-49,125`
- **Preuve** : l'export ne lit que profil (seulement `createdAt`), favoris, listes, surlignages, notes et clés. Il manque les sujets `feedback/{id}` avec `authorUid == uid`, les votes `users/{uid}/feedbackVotes/*` et `lastLoginAt`. La politique promet « tout ce que Sextant conserve pour vous » ; `/compte` affirme « favoris, listes, citations et notes. Rien d'autre ». La politique ne mentionne nulle part `lastLoginAt` ni la date de création du compte.
- **Impact** : droit d'accès et de portabilité (RGPD art. 15 et 20) incomplet en libre-service ; texte de `/compte` inexact. Données concernées limitées (sujets déjà publics, votes = identifiant + date), droit d'accès toujours exerçable par le contact indiqué.
- **Recommandation** :
  1. `feedback.ts` : `listFeedbackByAuthor(uid)` avec `where("authorUid", "==", uid).get()` trié en mémoire (pas d'`orderBy`, pour éviter un index composite), et `listFeedbackVotesForExport(uid)` qui garde `createdAt` (sans `.select()`).
  2. `export/route.ts` : ajouter ces deux lectures au `Promise.all`, `lastLoginAt` au `profile`, `feedback: { published, votes }` au JSON ; supprimer la troncature des notes (SEC-19).
  3. `compte/page.tsx:84-85` : liste exacte (favoris, listes, citations, notes, clés d'assistants IA, sujets et votes « Bugs et idées », dates de création et de dernière connexion), en gardant « Aucun suivi. ».
  4. `confidentialite/page.tsx:40-49` : ajouter les dates de création et de dernière connexion.
- **Verdict** : partiel. Faits exacts et lignes justes ; mal classé en sécurité, impact limité.

#### NEW-3 — Relais PDF : coût en bande passante et en durée de fonction exposé, cache CDN contournable par un paramètre ajouté

- **Sévérité** : faible (moyenne si le compte passe en Pro sans plafond) · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/api/pdf/route.ts:9,11,25,29-33,68`
- **Preuve** : `maxDuration = 60`, `MAX_BYTES = 60 Mo`, 30 requêtes/min par IP et par instance, `cache-control: public, max-age=3600, s-maxage=86400`. La route ignore tout paramètre autre que `work`, alors que la clé du CDN inclut la query string : sur W4323848232, GET MISS, puis HIT, puis `&v=verif1` → MISS. La configuration du pare-feu Vercel du projet renvoie « Seawall Config not found » (aucune règle).
- **Impact** : risque d'épuisement du quota de transfert et de durée de fonction Vercel. Point clé relevé à la vérification : les HIT du CDN ne passent pas par la fonction, donc ne sont jamais limités, alors qu'ils comptent dans le Fast Data Transfer. Le compte porte 5 projets : une mise en pause Hobby toucherait les cinq sites. Il faut un attaquant délibéré. Distinct du choix connu (limite en mémoire).
- **Recommandation** :
  1. (S, la seule mesure qui couvre HIT et MISS) Vercel > sextant > Firewall > Custom Rules > Rate Limit : chemin commençant par `/api/pdf`, clé IP, par exemple 20 req/60 s, action 429.
  2. (S) Activer les notifications d'usage (Fast Data Transfer, Fast Origin Transfer) ; en Pro, Spend Management avec plafond ; envisager d'isoler Sextant sur son propre compte.
  3. (S, hygiène) URL canonique : GET, après la validation l.23, `` if (url.search !== `?work=${id}`) return NextResponse.redirect(new URL(`/api/pdf?work=${id}`, url), 308); `` ; même chose pour le HEAD après la l.81.
  4. Ne pas baisser `MAX_BYTES` sans chiffre ; en option, une limite en octets par IP (300 Mo/10 min) comptée à la fin du flux.
  5. Rien à changer côté « proxy pour des tiers » : adresses issues d'OpenAlex seulement, pas de CORS.
- **Verdict** : partiel. Réglages et contournement du cache confirmés ; raisonnement de l'auditeur faux sur le rôle du cache (la répétition de l'URL canonique est le pire cas) ; changer d'identifiant contourne déjà le cache.

#### NEW-4 — Développement local (et aperçus de branche) branchés sur la base et l'authentification de production, sans émulateur ni projet de dev

- **Sévérité** : faible · **Effort** : M · **Vérification** : partiel
- **Emplacement** : `.firebaserc:3` ; `firebase.json` ; `src/lib/firebase/admin.ts:19-35` ; `.env.example` ; `README.md:128`
- **Preuve** : `.firebaserc` ne connaît que `sextant-ba71a` ; `firebase.json` n'a pas de bloc `emulators` ; aucune mention de `FIRESTORE_EMULATOR_HOST` ; `adminApp()` initialise toujours avec `cert(FIREBASE_SERVICE_ACCOUNT)`. `npm run dev` lit et écrit donc la base de production ; `recursiveDelete` et `batch.delete` existent ; la collection `feedback` est globale. Les aperçus de branche répondent 302 vers Vercel SSO (protégés).
- **Impact** : un bogue en développement (suppression récursive, boucle d'écriture) touche les comptes réels ; les sujets de test polluent `/retours`. Aucune sauvegarde ni PITR documentée. Risque d'hygiène porté par le développeur, pas un vecteur tiers.
- **Recommandation** :
  1. (S) Filet immédiat : `gcloud firestore databases update --database='(default)' --enable-pitr`, ou sauvegarde quotidienne `gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=7d`.
  2. (S) Garde-fou dans `admin.ts` : `if (process.env.NODE_ENV === "development" && !process.env.FIRESTORE_EMULATOR_HOST && process.env.ALLOW_PROD_DB !== "1") throw new Error(...)`.
  3. (M) Émulateurs : `"emulators": { "auth": { "port": 9099 }, "firestore": { "port": 8080 }, "ui": { "enabled": true } }` ; si `FIRESTORE_EMULATOR_HOST` est défini, `initializeApp({ projectId: "demo-sextant" })` sans `cert` ; `connectAuthEmulator` côté client ; script `"dev:emu": "firebase emulators:exec --only auth,firestore --project demo-sextant 'next dev'"` ; documenter dans `.env.example` et le README.
  4. (S) Vercel : restreindre `FIREBASE_SERVICE_ACCOUNT` à l'environnement Production ; vérifier Git Fork Protection (dépôt public).
- **Verdict** : partiel. Cœur confirmé ; aperçus protégés par SSO, « code non relu » exagéré (auteur unique, 0 fork), point du lien de partage `localhost` faux (l'URL est recalculée à l'affichage).

#### NEW-14 — Aucune durée de conservation pour les comptes inactifs ni pour les clés MCP inutilisées

- **Sévérité** : faible · **Effort** : M · **Vérification** : confirmé
- **Emplacement** : `src/app/confidentialite/page.tsx:59` ; `src/app/api/auth/session/route.ts:47` ; `src/lib/api-keys.ts:62-66`
- **Preuve** : la politique annonce « Durée : tant que le compte existe ». `lastLoginAt` et `apiKeys.lastUsedAt` sont écrits mais jamais lus ; ni `vercel.json`, ni route `/api/cron`, ni politique TTL Firestore. Les clés n'expirent jamais (voir SEC-11).
- **Impact** : conservation illimitée de données personnelles et de clés dormantes, contraire à la limitation de conservation (RGPD art. 5.1.e) et à la bonne pratique CNIL. Clés stockées en empreinte SHA-256 : une fuite de base ne livre pas de clé utilisable ; le risque est une clé oubliée dans un connecteur tiers.
- **Recommandation** :
  1. Extraire la suppression de compte de `auth/account/route.ts:18-29` dans `deleteAccountData(uid)` (`src/lib/account.ts`), partagée par la route et le cron.
  2. Route `src/app/api/cron/retention/route.ts` (GET, `runtime = "nodejs"`, refus sans `Authorization: Bearer ${process.env.CRON_SECRET}`) : supprimer les `apiKeys` dont `lastUsedAt` (ou `createdAt` si `lastUsedAt` est nul) date de plus de 12 mois ; parcourir `adminAuth().listUsers()` et supprimer les comptes dont `metadata.lastSignInTime` et le dernier usage de clé datent de plus de 3 ans ; mode `?dryRun=1` à lancer avant toute suppression.
  3. `vercel.json` : `{ "crons": [{ "path": "/api/cron/retention", "schedule": "0 4 1 * *" }] }` et variable `CRON_SECRET`.
  4. Politique : « au plus 3 ans après la dernière connexion ou le dernier usage d'une clé » (l.59) et « une clé inutilisée pendant 12 mois est supprimée » (section MCP).
- **Verdict** : confirmé. Sévérité faible : critère de durée formellement acceptable, manque de conformité plus qu'une faille. Un utilisateur MCP seul ne met jamais `lastLoginAt` à jour : combiner les deux critères.

### 4.2 Performance

#### PERF-01 — Le layout racine lit le cookie de session : tout le site est rendu à la demande en no-store (ni CDN, ni bfcache, ni préchargement)

- **Sévérité** : moyenne · **Effort** : M · **Vérification** : partiel
- **Emplacement** : `src/app/layout.tsx:22` ; `src/components/site-header.tsx:13` ; `src/lib/auth.ts:28-31` ; `src/app/theme/[slug]/page.tsx:16,30`
- **Preuve** : `layout.tsx:22` et `site-header.tsx:13` font `isAuthEnabled() ? await getCurrentUser() : null`, qui lit `cookies()`. Build : 37 routes ƒ pour 1 seule ○ (`/icon.svg`), `dynamicRoutes = []`, `generateStaticParams` des thèmes sans effet. En production, `/`, `/a-propos`, `/mentions-legales`, `/conditions`, `/theme/informatique` répondent `private, no-cache, no-store`, `x-vercel-cache: MISS`, `cdg1::iad1`. TTFB de `/a-propos` 250–300 ms à chaud (attente serveur 143–167 ms contre 35–50 ms pour la CSS statique), 1,4–1,7 s à froid. Les 11 rapports Lighthouse échouent à bf-cache (`MainResourceHasCacheControlNoStore`). Seul `article/[id]` a un `loading.tsx`.
- **Impact** : chaque vue, même d'une page légale, lance une fonction en iad1 sans cache au bord (coût, démarrages à froid). Les navigations vers `/search`, `/theme/*`, `/favoris`, `/citations` n'ont pas de retour visuel immédiat. Seules 6 routes y gagneraient réellement (`/`, pages légales, `/a-propos`, 404) : `/search` et `/theme/[slug]` restent dynamiques à cause de `searchParams`, et la fiche lit elle-même la session.
- **Recommandation** :
  1. Récupérer l'identité côté client : supprimer `layout.tsx:22` et `site-header.tsx:13` ; `FavoritesProvider` obtient l'utilisateur via un GET ajouté à `api/auth/session/route.ts` (`{uid, name, email, picture}` ou `null`, `private, no-store`) ou via un champ `user` de `GET /api/favorites` ; `AuthButton` lit le contexte et affiche un squelette rond pendant le chargement. `/favoris`, `/citations` et `/compte` gardent leur `getCurrentUser` serveur.
  2. Vérifier au build que `/`, `/a-propos`, `/conditions`, `/confidentialite`, `/mentions-legales` et `/_not-found` passent en ○ (accueil en ISR 600 s), puis `x-vercel-cache: HIT` en production.
  3. `/theme/[slug]` et `/search` : `cacheComponents: true` et `<Results>` sous `<Suspense>` (effort L, à valider), ou accepter le dynamique.
  4. (S) `loading.tsx` sous `src/app/search/`, `src/app/theme/[slug]/`, voire `favoris/` et `citations/`.
  5. Voir PERF-05 (`checkRevoked`) et PERF-04 (région).
- **Verdict** : partiel. Mécanisme confirmé en production ; gain limité à l'accueil et aux pages légales ; le retour arrière entre résultats et fiche passe par le cache du routeur, pas par le bfcache. Sévérité ramenée de élevée à moyenne.

#### PERF-02 — SDK Firebase Auth chargé et initialisé sur chaque page pour les visiteurs anonymes, avec l'iframe Google en plus sur mobile et Safari

- **Sévérité** : moyenne · **Effort** : M · **Vérification** : partiel
- **Emplacement** : `src/components/auth/auth-button.tsx:6,19,33-36` ; `src/components/auth/sign-in-dialog.tsx:5,9,91-103` ; `src/lib/firebase/client.ts:27-38`
- **Preuve** : `auth-button.tsx` importe statiquement `signOut` et `firebaseAuth` ; son `useEffect` appelle `completeRedirectSignIn()` → `getRedirectResult(firebaseAuth())` à chaque montage si `!user`. `getAuth()` initialise d'office le résolveur popup/redirection quand `_isMobileBrowser() || _isSafari() || _isIOS()` (@firebase/auth index-4NFEPWkC.js:2716, 10833). Sur mobile : 6 requêtes tierces (api.js, gapi_iframes 34,5 KiB, iframe `/__/auth`, iframe.js 92,5 KiB, getProjectConfig et son préflight), 134 KiB et 3 origines ; 0 en Chrome desktop. firebase/app + auth : 128 Ko bruts / 35 Ko gz dans le chunk partagé du layout (~11 % du JS de `/a-propos` selon la vérification, et non 21 %).
- **Impact** : ~135 Ko et 3 connexions TLS à chaque chargement complet sur mobile et Safari, ~35 Ko gz de JS inutile pour tout anonyme, base IndexedDB créée pour chaque visiteur. Confidentialité : l'IP et l'user-agent de visiteurs qui ne se connectent jamais partent chez Google, alors que la section « Sans compte » de la politique n'en parle pas. Le gain Lighthouse (65 → 88) est un artefact de la simulation Lantern : en bridage réel, 98–99 dans les deux cas, TBT négligeable.
- **Recommandation** :
  1. (S, supprime les 6 requêtes) `sign-in-dialog.tsx:50` : avant `signInWithRedirect`, `try { sessionStorage.setItem("sextant:redirect-pending", "1") } catch {}` ; au début de `completeRedirectSignIn()`, sortir si le drapeau est absent, puis le retirer. Ne jamais appeler `firebaseAuth()` au montage sans ce drapeau (c'est `getAuth()` qui déclenche l'iframe).
  2. (M, retire ~35 Ko gz) Supprimer les imports statiques de `firebase/auth` et `@/lib/firebase/client` dans `sign-in-dialog.tsx`, `auth-button.tsx` et `account-actions.tsx`, remplacés par `await Promise.all([import("firebase/auth"), import("@/lib/firebase/client")])`. Traiter d'abord `sign-in-dialog.tsx`, importé par 7 composants. Sur Safari et iOS, lancer l'import **et** l'initialisation de l'iframe à l'ouverture de la boîte de dialogue, sinon `signInWithPopup` (qui attend `resolver._initialize()` avant `window.open`) sera bloqué.
  3. (S) Tant que l'étape 1 n'est pas faite, mentionner le module Google dans « Sans compte » de `/confidentialite`.
  4. Vérifier avec `--throttling-method=devtools` : 0 requête vers `apis.google.com`, `firebaseapp.com`, `googleapis.com` en mobile anonyme.
- **Verdict** : partiel. Mécanisme reproduit ; chiffres de performance surévalués (simulation), impact surtout confidentialité et octets gaspillés. Sévérité moyenne.

#### PERF-04 — Fonctions serverless en iad1 (États-Unis) pour un public francophone, alors que Firestore est annoncé à Paris

- **Sévérité** : moyenne · **Effort** : S · **Vérification** : partiel
- **Emplacement** : réglage de région du projet Vercel (ni `vercel.json` ni `preferredRegion`) ; `src/app/confidentialite/page.tsx:55`
- **Preuve** : `/api/health` renvoie `region: iad1` ; toutes les réponses portent `x-vercel-id: cdg1::iad1::…`. La politique place Firestore « en Europe, région Paris » (non vérifiable : CLI 401, API Vercel 403). `/retours` (1 lecture Firestore en anonyme) : médiane ~415 ms contre ~250 ms pour `/a-propos`, soit ~165 ms d'écart, cohérent avec 1 à 2 allers-retours transatlantiques.
- **Impact** : chaque lecture ou étape de transaction Firestore traverse l'Atlantique (~80–100 ms), en plus du trajet Paris → iad1 pour toute page dynamique. Les votes et favoris (`runTransaction`, ~2 allers-retours) sont les plus touchés. Côté RGPD, les transferts sont déjà déclarés (l.85, 112-113) : c'est un gain de minimisation, pas une non-conformité.
- **Recommandation** :
  1. Vérifier la région Firestore (console > Firestore > Emplacement, ou `firebase firestore:databases:get "(default)" --project sextant-ba71a`) ; on attend `europe-west9`.
  2. Si Paris ou eur3 : créer `vercel.json` avec `{ "$schema": "https://openapi.vercel.sh/vercel.json", "regions": ["cdg1"] }` (ou Settings > Functions > Function Region). Mistral, en Europe, en profite aussi.
  3. Ne pas ajouter d'emblée `preferredRegion = "iad1"` sur les routes OpenAlex : mesurer d'abord `/search`, `/api/suggest`, `/article/[id]` en cache miss avant et après.
  4. Mesurer 6 à 10 GET avant/après (`/retours`, `/a-propos`, `/favoris`, `/citations`) ; gain attendu ~80 ms par page dynamique, ~150–250 ms sur la bibliothèque et les mutations.
  5. Consigner la région dans le README ; préciser l'exécution à Paris dans `confidentialite/page.tsx:85`.
- **Verdict** : partiel. Région confirmée, écart mesuré ; région Firestore non vérifiée ; impact RGPD exagéré ; OpenAlex (États-Unis) limite le gain sur certaines pages.

#### PERF-06 — Lecteur PDF : le fichier est téléchargé en entier avant le premier rendu (aucune requête Range)

- **Sévérité** : moyenne · **Effort** : M · **Vérification** : confirmé
- **Emplacement** : `src/app/api/pdf/route.ts:63-72,105-117` ; `src/components/highlights/pdf-reader.tsx:173-179`
- **Preuve** : `/article/W2626778328/lire` en mobile : LCP 16,4 s, 2 786 KiB transférés dont 2 164,8 KiB pour `/api/pdf`. Le relais ne transmet ni `Accept-Ranges` ni l'en-tête `Range` ; PDF.js 6.3.289 n'active les plages que si la réponse porte `Accept-Ranges: bytes` (pdf.mjs:13560) et, sinon, attend tout le flux avant de résoudre `getDocument`. arXiv, la source réelle, répond pourtant `accept-ranges: bytes`. W4405561638 (23 Mo) : `x-vercel-cache: MISS` deux fois de suite, fichier entier renvoyé en 200.
- **Impact** : page vide jusqu'à la fin du téléchargement : ~11 s pour 2,2 Mo en 4G lente, bien plus pour les PDF de 10 à 25 Mo, qui ne semblent pas mis en cache au bord. La linéarisation ne change rien sans plages.
- **Recommandation** (dans `src/app/api/pdf/route.ts`, sans changement de réglage PDF.js) :
  1. Fixer la source : paramètre `src` (hôte déjà renvoyé par la sonde HEAD dans `x-sextant-source`) ; `pdf-reader.tsx` fait d'abord le HEAD puis ouvre `${url}&src=${host}`. Sans cela, des plages lues chez deux hébergeurs différents mélangeraient deux fichiers.
  2. GET avec `Range: bytes=a-b` : transmettre `range` en amont, ne pas exiger `%PDF` si a > 0, n'accepter que `upstream.status === 206` avec un `content-range` valide, renvoyer 206 avec `content-range`, `content-length`, `accept-ranges: bytes`, `cache-control: private, no-store` ; si l'amont répond 200, renvoyer 502 (PDF.js écrirait sinon le fichier entier à l'offset demandé). Garder `MAX_BYTES` sur la taille totale.
  3. GET complet : `accept-ranges: bytes` seulement si l'amont l'annonce, que `content-length` est connu et sans `content-encoding`.
  4. Compter les requêtes de plage sous une clé séparée (`pdfr:${ip}`, ~300/min), sinon la limite de 30/min fait échouer des pages.
  5. Tester W4405561638 (page 1 avant la fin), un hébergeur sans plages, et une réponse HIT du cache.
- **Verdict** : confirmé, avec une recommandation corrigée : la version initiale (ajouter simplement `Accept-Ranges`) aurait cassé le lecteur (signature `%PDF`, source variable, amont qui ignore Range, limite de débit).

#### PERF-14 — « Pour vous » se recharge à chaque clic sur un cœur et la grille se réorganise sous le pointeur

- **Sévérité** : moyenne · **Effort** : S · **Vérification** : confirmé
- **Emplacement** : `src/components/for-you.tsx:24,26-46` ; `src/app/api/recommendations/route.ts:75-105`
- **Preuve** : `const favKey = waiting ? null : favorites.favoriteIds.slice(0, 30).join(",")` puis `useEffect(…, [favKey])`. Un cœur basculé passe en tête de `favoriteIds` : `favKey` change et un nouveau `fetch /api/recommendations` part avec une URL inédite. La route exclut les favoris (`exclude = new Set([...seen, ...fav, ...hide])`) : la carte qu'on vient d'enregistrer disparaît à coup sûr. Mesure : MISS, TTFB 0,64–0,76 s, total 0,81–0,89 s, au-delà de la fenêtre de 500 ms qui exclut les décalages du CLS. En plus, la l.43 masque toute la section sur une erreur de rechargement (429/502).
- **Impact** : le toast « Ajouté à vos favoris » s'affiche puis la carte disparaît sous le pointeur ; décalage de mise en page ; une invocation serverless et 2 requêtes OpenAlex par clic ; section entière perdue sur un 502 transitoire.
- **Recommandation** :
  1. Figer les graines une fois les favoris prêts, sans `useRef` lu au rendu (règle `react-hooks/refs`) :
     ```ts
     const [seed, setSeed] = useState<{ enabled: boolean; key: string } | null>(null);
     if (!waiting && (seed === null || seed.enabled !== favorites.enabled)) {
       setSeed({ enabled: favorites.enabled, key: favorites.favoriteIds.slice(0, 30).join(",") });
     }
     const favKey = seed?.key ?? null;
     ```
  2. l.43 : `if (!ctrl.signal.aborted) setState((s) => (s.items.length ? s : { status: "hidden", items: [], fromFavorites: false }));`
  3. Vérifier qu'aucun appel `/api/recommendations` ne part après un clic sur un cœur.
- **Verdict** : confirmé ; la disparition est systématique et non éventuelle. Sévérité moyenne, surtout pour le comportement.

#### PERF-19 — Décalage de mise en page à l'arrivée de l'article (CLS 0,095 en desktop) : le footer est repoussé

- **Sévérité** : moyenne · **Effort** : S · **Vérification** : confirmé
- **Emplacement** : `src/app/article/[id]/loading.tsx:3-13` ; `src/app/layout.tsx:28-33`
- **Preuve** : Lighthouse desktop : CLS 0,095, attribué à 0,0947 au `<footer class="mt-8 border-t …">`. Le squelette mesure ~476 px ; `body` est en `flex min-h-full flex-col` avec `<main className="flex-1">` : le footer est collé en bas de l'écran pendant le chargement puis repoussé. Vérification : 0,0987 à 1440×800 (3 essais sur 4), **0,257 à 390×844 sans émulation tactile** (3 essais sur 4, note « mauvais »). Le score vaut la hauteur visible du footer divisée par celle de l'écran (89/940 = 0,0947 ; 217/844 = 0,257). Lighthouse mobile affiche 0 à tort (drapeau `hadRecentInput` de l'émulation tactile).
- **Impact** : CLS « mauvais » sur mobile réel pour les fiches article, principale page d'arrivée, avec effet sur les Core Web Vitals et le SEO ; saut visible du pied de page.
- **Recommandation** : dans `loading.tsx:5`, `<div className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-6">` (ou `min-h-[100svh]`) : le footer est hors écran pendant le chargement, un décalage hors viewport ne compte pas, CLS attendu à 0. Ne pas mettre de `min-h` sur `<main>` (effet sur toutes les pages). Garder le squelette plutôt que supprimer `loading.tsx` (voir QUAL-36). Vérifier en desktop et à 390×844 sans émulation tactile.
- **Verdict** : confirmé, sévérité relevée à moyenne (le mobile, non mesuré par l'auditeur, est le cas le plus grave).

#### PERF-27 — Lecteur PDF : hauteur provisoire A4 fixe pour les pages non rendues, et un IntersectionObserver par page

- **Sévérité** : moyenne · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/components/highlights/pdf-reader.tsx:245-248,352,358-379,431`
- **Preuve** : `const [aspect, setAspect] = useState(1.414)` puis `height: rendered ? undefined : width * aspect` : la vraie proportion n'est connue qu'au rendu de chaque page. Mesure sur W2124637492 (54 pages Letter, largeur 780 px) : page rendue 1009,4 px, non rendue 1102,9 px (93,5 px de trop). Premier « aller à la page 30 » : le haut de la page 30 finit à −2 525 px (27 × 93,5), soit ~2,5 pages trop loin ; page 50 : −1 403 px ; second saut : exact. Cause : le défilement doux (l.247) traverse des pages qui rétrécissent en route.
- **Impact** : bug de navigation depuis « Mes surlignages » à chaque ouverture du lecteur, sur le format Letter courant (arXiv, IEEE, ACM, PLOS) et les pages en paysage. Les 150 observateurs n'ont pas d'effet mesurable.
- **Recommandation** :
  1. Proportion par défaut tirée du document (l.184-190) : après `const d = await task.promise;`, `const v = (await d.getPage(1)).getViewport({ scale: 1 });` (vérifier `cancelled`), puis `setDefaultAspect(v.height / v.width)` avant `setDoc(d)` ; passer `defaultAspect` en prop à `PdfPage` et remplacer la l.352 par `useState(defaultAspect)`.
  2. `onGoto` (l.245-248) : `behavior: "auto"` au lieu de `"smooth"`, ou relancer `scrollIntoView({ block: "start" })` quand la page cible est rendue.
  3. Vérifier : premier saut vers la page 30 de W2124637492 avec le haut de page à ~0 px.
  4. Observateur commun : facultatif, sans gain mesurable.
- **Verdict** : partiel. Le volet observateurs est exagéré ; le vrai problème est un bug de navigation, sous-évalué à l'origine.

#### PERF-28 — Champs Années : une navigation serveur au simple passage du focus, même sans modification

- **Sévérité** : moyenne · **Effort** : S · **Vérification** : confirmé
- **Emplacement** : `src/components/search-filters.tsx:57-68,128-130,140-142`
- **Preuve** : `onBlur={(e) => update({ from: e.target.value })}` et Entrée ; `update` fait toujours `next.delete("page")` puis `startTransition(() => router.push(…))` sans comparer. Mesure sur `/search?q=climate` : deux Tab sans saisie → deux GET `/search?q=climate&_rsc=…` pour une URL identique. Sur `/theme/informatique`, traverser « De » pousse `?from=2025` (valeur par défaut) : le tri passe de « Les plus cités » à « Pertinence » et « Réinitialiser » apparaît (vérifié par GET).
- **Impact** : requêtes RSC et invocations inutiles ; au clavier, retour en page 1 (les filtres précèdent la pagination dans l'ordre de tabulation) ; sur les thèmes, le simple passage du focus change les résultats affichés.
- **Recommandation** :
  1. Garde-fou après `update` :
     ```ts
     const lastYear = useRef({ from: params.get("from") ?? defaults?.from ?? "", to: params.get("to") ?? defaults?.to ?? "" });
     const commitYear = (key: "from" | "to", raw: string) => {
       const v = raw.trim();
       const current = params.get(key) ?? defaults?.[key] ?? "";
       if (v === current || v === lastYear.current[key]) return;
       lastYear.current[key] = v;
       update({ [key]: v });
     };
     ```
  2. l.129-130 et 141-142 : `onBlur={(e) => commitYear("from", e.currentTarget.value)}` et `onKeyDown={(e) => e.key === "Enter" && commitYear("from", e.currentTarget.value)}` (idem `"to"`).
  3. « Réinitialiser » (l.148) : `lastYear.current = { from: "", to: "" }`.
  4. Vérifier sur `/search?q=x&page=3` et `/theme/informatique` : aucune requête `_rsc` en traversant les champs.
- **Verdict** : confirmé, sévérité relevée de faible à moyenne (effet sur les résultats et la navigation au clavier).

#### PERF-03 — Base UI Menu et floating-ui dans le bundle du layout pour tous les visiteurs, alors que le menu ne sert qu'aux connectés

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/components/auth/auth-button.tsx:9,11-18,61-97` ; `src/components/collections/collection-picker.tsx:6-16` ; `src/components/site-header.tsx:26`
- **Preuve** : deux chunks d'entrée du layout, `3lr4iw3eg_w94.js` (58,7 Ko / 18,1 Ko gz : DropdownMenu, Menu) et `322z80qutgjmy.js` (47,4 Ko / 17,0 Ko gz : positioner, autoUpdate), présents sur toutes les pages. Dans le layout, seul le menu avatar des connectés s'en sert. `collection-picker.tsx` importe aussi DropdownMenu en statique sur la fiche, alors qu'un anonyme ne voit jamais le menu.
- **Impact** : ~106 Ko bruts (~35 Ko gz) jamais affichés pour chaque anonyme, en première visite (chunks `immutable`). Gain complet sur `/`, pages légales, `/liste`, lecteur et 404 ; ~18 Ko gz sur les pages à Select (le Select a besoin du positioner).
- **Recommandation** :
  1. Créer `src/components/auth/account-menu.tsx` (`"use client"`, export par défaut `AccountMenu({ user })`) avec les l.60-97 et `logout()`.
  2. Dans `auth-button.tsx`, retirer les imports dropdown-menu et avatar, ajouter `const AccountMenu = dynamic(() => import("@/components/auth/account-menu"));` et `return <AccountMenu user={user} />;`.
  3. Même traitement pour `collection-picker.tsx` (branche `enabled` dans `collection-menu.tsx` chargé par `dynamic()`), sinon `/article/[id]` ne gagne rien.
  4. Vérifier après build que `entryJSFiles["[project]/src/app/layout"]` ne contient plus `dropdown-menu-content` ni `autoUpdate`.
- **Verdict** : partiel. Chiffres confirmés ; gain limité à une partie des pages et à la première visite.

#### PERF-05 — verifySessionCookie(token, true) : un appel réseau à Identity Toolkit à chaque rendu et à chaque appel d'API d'un utilisateur connecté

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/lib/auth.ts:31`
- **Preuve** : avec `checkRevoked = true`, firebase-admin appelle `this.getUser(sub)` (base-auth.js:581-587, 958-960), soit `accounts:lookup` sur Identity Toolkit. `getCurrentUser` (dédupliqué par `cache()`) est attendu par le layout avant le moindre octet et par toutes les routes authentifiées. Sur la fiche, le lookup précède les 3 lectures Firestore.
- **Impact** : un aller-retour vers Google (~30–100 ms depuis iad1, estimé, non mesuré) sur les chargements complets connectés et chaque mutation. Pas « à chaque rendu » en navigation client (le layout n'est pas re-rendu).
- **Recommandation** :
  1. `getCurrentUser` sans contrôle de révocation (`verifySessionCookie(token)`) pour les rendus et les GET.
  2. `getCurrentUserStrict = cache(async () => …verifySessionCookie(token, true)…)`, avec éventuellement une `Map<uid, expiresAt>` de 5 min au niveau du module.
  3. `getCurrentUserStrict` dans les écritures et opérations sensibles : `auth/account` (DELETE), `account/export`, `account/keys` et `keys/[id]`, `collections/[id]/share`, POST/PUT/DELETE de favorites, highlights, notes, collections, feedback.
  4. Documenter le délai de détection d'un compte supprimé (5 min avec la mémorisation) ; une vraie révocation passe par SEC-08.
- **Verdict** : partiel. Mécanisme exact ; coût réel mais borné et non mesuré. Compromis à documenter : sans `checkRevoked`, un cookie resté sur un autre appareil pourrait recréer des données après suppression de compte, d'où la variante stricte pour les écritures.

#### PERF-07 — Aucun délai maximal sur les appels OpenAlex, Mistral et Anthropic : une page peut attendre jusqu'à la limite de la fonction

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/lib/openalex.ts:199-203` ; `src/app/api/suggest/route.ts:30` ; `src/lib/ai.ts:71` ; `src/app/api/summary/route.ts:80`
- **Preuve** : `let res = await fetch(url, { next: { revalidate } })` sans `signal`, relance après `setTimeout(1200)`. Même absence de délai pour Mistral, pour `new Anthropic()` (10 min et 2 relances par défaut) et pour l'autocomplétion. Seules `/api/pdf` et `/api/mcp` déclarent `maxDuration = 60`. Mesure : OpenAlex répond 504 en 9,2–9,3 s pour un identifiant hors plage ; la fiche échoue en 10,7 s. Dans les Server Components, la relance est neutralisée par la mémorisation `dedupe-fetch` (même URL).
- **Impact** : si OpenAlex ralentit, fiches, recherches et suggestions occupent une fonction 10 à 20 s ; `/api/recommendations` enchaîne deux étapes OpenAlex (jusqu'à ~39 s sans `maxDuration`). Un Mistral lent peut atteindre la limite de la fonction (réponse non JSON, QUAL-21). Gain mesurable modeste (~1 à 2 s sur le cas réel).
- **Recommandation** :
  1. `openalex.ts`, budget global plutôt qu'un délai par tentative :
     ```ts
     const deadline = Date.now() + 8_000;
     const attempt = () => fetch(url, { next: { revalidate }, signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) });
     let res = await attempt();
     if (RETRYABLE.has(res.status) && res.status !== 504 && deadline - Date.now() > 3_000) { await new Promise((r) => setTimeout(r, 800)); res = await attempt(); }
     ```
     Convertir `TimeoutError`/`AbortError` en `new OpenAlexError(…, 504)`. Le `signal` désactive la mémorisation par requête : envelopper `getWork` dans `cache()` de React pour ne pas doubler l'appel (generateMetadata + page).
  2. `src/app/article/[id]/error.tsx` (voir QUAL-03).
  3. `suggest/route.ts:30` : `signal: AbortSignal.any([req.signal, AbortSignal.timeout(3_000)])`.
  4. `ai.ts:71` : `signal: AbortSignal.timeout(20_000)` et `AiError(…, 504)` ; `export const maxDuration = 30` dans `summary/route.ts` ; `new Anthropic({ timeout: 20_000, maxRetries: 1 })`.
  5. Facultatif : `maxDuration = 30` dans `recommendations/route.ts`.
- **Verdict** : partiel. Faits exacts ; plafond de 300 s théorique (OpenAlex coupe à ~9,2 s) ; pas de page blanche (squelette et Suspense) ; Anthropic inactif.

#### PERF-08 — /retours, page publique en force-dynamic : jusqu'à 300 documents lus à chaque visite, même anonyme

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/retours/page.tsx:13,16,20` ; `src/lib/feedback.ts:26-36`
- **Preuve** : `listFeedback()` fait `collection("feedback").orderBy("createdAt","desc").limit(300).get()` à chaque visite, sans cache. En production : `"initial":[]`, 0 sujet, donc 1 lecture par visite aujourd'hui. TTFB `/retours` 336–541 ms contre 232–257 ms pour `/a-propos`.
- **Impact** : à 300 sujets, ~166 visites/jour suffisent à consommer 50 000 lectures (grave seulement en plan Spark) ; robots compris puisque la page est indexable. Impact nul aujourd'hui.
- **Recommandation** (prévention) :
  1. `feedback.ts` : `export const listFeedbackCached = unstable_cache(() => listFeedback(), ["feedback-list"], { tags: ["feedback"], revalidate: 60 });`
  2. `retours/page.tsx:20` : appeler `listFeedbackCached()` en parallèle de `getCurrentUser()`.
  3. Après `createFeedback` (`api/feedback/route.ts:26`) et `toggleVote` (`vote/route.ts:19`) : `revalidateTag("feedback", { expire: 0 })` (signature Next 16 à deux arguments).
  4. Ne pas paginer à 50 tant que le tri par votes se fait côté client (voir NEW-11).
  5. Vérifier le plan Firebase (Blaze ou Spark).
- **Verdict** : partiel. Code exact ; `force-dynamic` n'est pas la cause (le layout rend déjà tout dynamique) ; impact nul à ce jour.

#### PERF-09 — Fiche article : les lectures Firestore ne démarrent qu'après OpenAlex et bloquent tout le contenu ; users/{uid} est lu deux fois

- **Sévérité** : faible · **Effort** : M · **Vérification** : partiel
- **Emplacement** : `src/app/article/[id]/page.tsx:62,75-82,95,163-164,211`
- **Preuve** : `const work = await getWork(id)`, puis seulement `await Promise.all([isFavorite, listHighlights, getNote])`, avant tout JSX. `isFavorite` lit `users/{uid}`, relu par `FavoritesProvider` via `GET /api/favorites` au même chargement complet.
- **Impact** : pour les connectés seulement, un aller-retour Firestore depuis iad1 s'ajoute après OpenAlex (squelette déjà affiché). En anonyme, aucun coût (TTFB mesuré ~0,20–0,23 s). La lecture en double ne se produit qu'au chargement complet.
- **Recommandation** :
  - (S) Lancer les lectures personnelles en même temps qu'OpenAlex :
    ```ts
    const wid = id.toUpperCase();
    const userP = isAuthEnabled() ? getCurrentUser() : Promise.resolve(null);
    const personalP = userP.then((u) => u
      ? Promise.all([isFavorite(u.uid, wid).catch(() => false), listHighlights(u.uid, wid).catch(() => []), getNote(u.uid, wid).catch(() => null)])
      : [false, [], null] as const);
    const [work, sessionUser, [initiallyFavorite, initialHighlights, initialNote]] = await Promise.all([getWork(id), userP, personalP]);
    if (!work) notFound();
    ```
  - (M, facultatif) Passer les promesses non attendues aux composants (`use()` sous des `<Suspense>` locaux), seulement si une mesure connectée le justifie.
  - Ne rien faire pour la double lecture de `users/{uid}` (négligeable ; la supprimer ferait clignoter le cœur).
- **Verdict** : partiel. Série réelle mais limitée aux connectés ; la vérification de session démarre déjà en parallèle via le layout.

#### PERF-10 — Cascade des requêtes favoris côté client : deux GET /api/favorites en série, listes chargées sans être ouvertes, « Pour vous » bloqué

- **Sévérité** : faible · **Effort** : M · **Vérification** : partiel
- **Emplacement** : `src/components/favorites/favorites-provider.tsx:155,182-192,221-236` ; `src/components/collections/collection-picker.tsx:37-39` ; `src/components/for-you.tsx:23-28` ; `src/components/favorites/favorites-list.tsx:71-72` ; `src/app/layout.tsx:29`
- **Preuve** : en dev connecté sur `/article/W2741809807` : `GET /api/favorites` à 530 ms (276 ms), puis `?collections=1` à 857 ms (373 ms). Le commentaire l.186 suppose l'inverse, mais `CollectionPicker` est dans le Suspense de `loading.tsx` et s'hydrate après le provider. Sur `/favoris`, `listCollections` est lu côté serveur puis `loadCollections(initialCollections)` relance `?collections=1` (jusqu'à 50 lectures de plus). Les cœurs des `WorkCard` sans `initialActive` s'affichent vides puis se remplissent.
- **Impact** : ~300 à 650 ms de cascade avant que les listes et « Pour vous » soient justes ; deux invocations au lieu d'une par chargement complet de fiche. Titre, résumé et cœur principal sont rendus côté serveur : le LCP ne bouge pas ; seul le libellé « Dans N listes » change ~300 ms plus tard.
- **Recommandation** :
  1. (S) `loadCollections` (l.182-192) : quand une requête sans les listes est en cours ou finie et que `collectionsLoadedRef.current` est faux, lancer en parallèle `fetch("/api/collections", { cache: "no-store" })` puis `applyCollections` et `markCollectionsLoaded(true)` avec les mêmes gardes (`seq === mutationSeq.current`, `forUser === loadedFor.current`). Garder le chargement au montage du `CollectionPicker` (le bouton affiche « Dans N listes »). Corriger le commentaire l.186.
  2. (M) Amorcer les identifiants depuis le serveur : `layout.tsx` passe `initialIds = user ? listFavoriteIds(user.uid).catch(() => null) : null` (sans `await`) ; le provider fait `initialIds.then(…)` dans l'effet l.221-236, **sans** `use()` (aucun Suspense au-dessus). Tester connexion/déconnexion et panne Firestore.
  3. (S) `/favoris` : option `loadCollections(seed, { fresh: true })` utilisée quand le serveur a réellement lu les listes.
  4. Laisser `for-you.tsx` tel quel.
- **Verdict** : partiel. Cascade confirmée ; impact surévalué ; charger les listes à l'ouverture du menu (proposé à l'origine) casserait le libellé du bouton.

#### PERF-11 — /favoris et /citations envoient et rendent tout d'un bloc (1 000 favoris, 2 000 citations), avec un filtre recalculé à chaque frappe

- **Sévérité** : faible (moyenne pour /citations au-delà de ~500 passages) · **Effort** : M · **Vérification** : partiel
- **Emplacement** : `src/app/favoris/page.tsx:22` ; `src/app/citations/page.tsx:22` ; `src/components/favorites/favorites-list.tsx:101-105,318-332` ; `src/components/highlights/citations-list.tsx:39-43,148-165` ; `src/lib/highlights.ts:41-46`
- **Preuve** : `listFavorites` (1 000) et `listHighlights` (2 000, texte ≤ 3 000 caractères, note ≤ 1 000) passés en entier à des composants client, sans pagination, virtualisation, `useDeferredValue` ni `content-visibility`. Filtre de `/citations` : `fold()` sur tous les champs à chaque frappe ; mesure Node : 76 ms au pire cas, 10 ms en réaliste, 0,6 ms avec un index pré-plié. Charge JSON : 11,8 Mo au pire cas, 2,8 Mo réaliste pour 2 000 citations, 0,28 Mo pour 200. `animate-in` sur chaque `li` de `/favoris` (~990 animations simultanées).
- **Impact** : dégradation linéaire, sensible seulement au-delà de 300 à 500 éléments (gros utilisateur, doctorant) ; lectures Firestore jusqu'à ~1 100 (`/favoris`) et ~2 050 (`/citations`) par visite aux plafonds.
- **Recommandation** :
  1. (S) `citations-list.tsx:39-43` : index pré-plié `` const folded = useMemo(() => new Map(items.map(h => [h.id, fold(`${h.text} ${h.note} ${h.article.title} ${h.article.authors}`)])), [items]); ``, `const dq = useDeferredValue(q);` et `folded.get(h.id)!.includes(fold(dq.trim()))`. Idem dans `favorites-list.tsx:103-105`.
  2. (S à M) Affichage par tranches de 50 avec « Afficher plus » (remis à 50 quand la recherche, la liste ou le tri changent) ; garder la liste complète pour compteurs et exports.
  3. (S) `favorites-list.tsx:322` : classes `animate-in …` seulement si `i < 12`.
  4. (S) `[content-visibility:auto] [contain-intrinsic-size:auto_180px]` sur les `li`.
  5. (L, plus tard) Pagination serveur (100 premiers + total `count()`) si des comptes réels dépassent ~500 éléments ; `loading.tsx` sur les deux pages.
- **Verdict** : partiel. Problème réel mais au plafond ; `animate-in` seulement sur `/favoris`, filtre de liste `/citations` déjà en `Set`, 10 Mo non compressés.

#### PERF-12 — FavoritesProvider : un contexte unique fait re-rendre tous les cœurs et tous les sélecteurs de liste à chaque changement

- **Sévérité** : faible · **Effort** : M · **Vérification** : partiel
- **Emplacement** : `src/components/favorites/favorites-provider.tsx:160-166,309,447-469` ; `src/components/collections/collection-picker.tsx:31,97-104` ; `src/components/favorites/favorites-list.tsx:94-99,319-368`
- **Preuve** : `value = useMemo(() => ({ has, favoriteIds: [...ids].reverse(), listsOf, … }), [16 dépendances])` : tout changement crée un nouvel objet et re-rend les 7 consommateurs. Le rafraîchissement au retour sur l'onglet (au plus une fois par minute) remplace toujours l'état même inchangé. `FavoritesList` consomme tout le contexte et rend 1 000 lignes non mémoïsées ; chaque ligne monte `CollectionPicker` avec un `Dialog.Root` fermé. React Compiler non activé.
- **Impact** : scalabilité, visible seulement au-delà de quelques centaines de favoris ; non mesuré. Un clic produit 1 rendu global au retrait, 2 à l'ajout (et non 3 : les mises à jour sont regroupées).
- **Recommandation** (mesurer d'abord au Profiler avec ~300 favoris) :
  1. (S à M) `favorites-list.tsx` : extraire le `<li>` (l.321-366) dans `FavoriteRow` sous `React.memo` avec des props stables ; `all` dépend de `[initial, favorites.ready, ids, favorites.added]` ; pagination au-delà de 200.
  2. (S) `refresh` (l.160-166) : ne pas appeler `applyIds`/`applyCollections` si rien n'a changé (comparaison des identifiants, noms, `shareToken`, `articleIds.join()`).
  3. (M) Séparer un `FavoritesActionsContext` stable d'un contexte d'état ; `toggle` lit `added` via un `addedRef`.
  4. (S, facultatif) `{creating && <CollectionDialog … />}`.
  5. (S à M, option) `reactCompiler: true` et `babel-plugin-react-compiler`.
- **Verdict** : partiel. Mécanisme réel ; décompte des rendus faux ; des sélecteurs fins seuls ne changeraient rien sur `/favoris`.

#### PERF-15 — Condensé IA : cache en mémoire par instance et route en POST non cacheable au CDN, donc recalcul à chaque instance froide

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/api/summary/route.ts:10,20-41,60`
- **Preuve** : `const cache = new Map<string, string>()` est perdu à chaque démarrage à froid et jamais partagé ; la route est en POST, donc aucun cache CDN, alors que la réponse ne dépend que de l'article et du modèle (clé `${model}:${id}`). `getWork` passe déjà par le Data Cache partagé.
- **Impact** : Mistral recalcule le même condensé sur chaque nouvelle instance (1 à 3 s d'attente, quota consommé). Faible en pratique : génération sur clic explicite, hors chargement de page, taux de répétition entre utilisateurs faible.
- **Recommandation** :
  1. `const PROMPT_VERSION = 1` (à incrémenter quand SYSTEM change).
  2. Document `aiSummaries/{encodeURIComponent(model)}__v{PROMPT_VERSION}__{id}` (l'encodage est obligatoire : les modèles OpenRouter contiennent un `/`).
  3. Garder la Map en premier niveau ; en cas d'absence, `await db.doc(...).get()` avant `getWork` (l.41) ; après succès (l.60), `db.doc(...).set({ summary: text, model, workId: id, createdAt })` sans attendre, avec `.catch()`, succès seulement.
  4. Placer la limite de débit de SEC-02 après la lecture des caches, avant l'appel au modèle.
  5. Optionnel : mémoriser le texte en `sessionStorage` dans `ai-summary.tsx` (try/catch).
- **Verdict** : partiel. Faits exacts ; impact exagéré ; `s-maxage` long illusoire (cache CDN purgé à chaque déploiement). Aucune mesure : POST interdit.

#### PERF-16 — Worker et ressources PDF.js servis sans cache long (max-age=0), sur un chemin non versionné

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `scripts/copy-pdfjs-assets.mjs:12-15` ; `src/components/highlights/pdf-reader.tsx:170-178` ; `next.config.ts` (aucun `headers()`)
- **Preuve** : `curl -I /pdf.worker.min.mjs` → `cache-control: public, max-age=0, must-revalidate`, 1 265 413 octets (386 576 en brotli) ; `/pdfjs/wasm/openjpeg.wasm` et le reste de `/public/pdfjs` (3,9 Mo) idem. `workerSrc = "/pdf.worker.min.mjs"` est un chemin fixe. Revalidation mesurée : `304` en 0,117 s.
- **Impact** : un aller-retour 304 d'environ 100 ms par ressource à chaque réouverture du lecteur. L'argument de cohérence est inversé : avec `max-age=0`, pas de décalage possible ; le risque n'apparaîtrait qu'avec un cache long non versionné.
- **Recommandation** (priorité basse) :
  1. `copy-pdfjs-assets.mjs` : lire la version dans `node_modules/pdfjs-dist/package.json` et copier dans `public/pdfjs/<version>/` (worker compris), après `rmSync(dest, { recursive: true, force: true })` ; retirer `/public/pdf.worker.min.mjs` de `.gitignore:44`.
  2. `pdf-reader.tsx:170-178` : `` const base = `/pdfjs/${pdfjs.version}`; `` puis `workerSrc`, `wasmUrl`, `iccUrl`, `standardFontDataUrl`, `cMapUrl` dérivés de `base`.
  3. `next.config.ts` : `async headers() { return [{ source: "/pdfjs/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] }]; }`.
  Ne jamais poser de cache long sans versionner le chemin.
- **Verdict** : partiel. Faits confirmés ; petite optimisation, pas un problème de cohérence.

#### PERF-17 — Lecteur PDF : chargement en cascade (chunk pdfjs, puis worker, puis PDF) au lieu de préchargements

- **Sévérité** : faible · **Effort** : S · **Vérification** : confirmé
- **Emplacement** : `src/components/highlights/pdf-reader.tsx:163-201` ; `src/components/highlights/read-pdf-button.tsx:38-42`
- **Preuve** : le chunk pdfjs (455 720 octets bruts, 139 360 en brotli selon la vérification) n'est demandé qu'après l'hydratation par `await import("pdfjs-dist")` (l.168) ; `/api/pdf` ne part qu'après la réponse du worker (pdf.mjs:15527, 16566). Chaîne : HTML → JS de la page → chunk pdfjs → worker (387 Ko br) → PDF. Mesures fibre : worker 0,35 s, PDF 2,2 Mo en 1,34 s.
- **Impact** : ~0,5 s perdue avant le début du téléchargement du PDF à la première ouverture sur fibre, davantage sur mobile ; quasi nul ensuite (chunk `immutable`, worker en 304).
- **Recommandation** :
  1. (S) `read-pdf-button.tsx:39`, branche lecteur : `onPointerEnter`, `onFocus`, `onTouchStart` → `() => { void import("pdfjs-dist"); }`, et `<link rel="prefetch" href="/pdf.worker.min.mjs">` une fois la sonde HEAD réussie.
  2. (S) Cache du worker : voir PERF-16.
  3. (S à M) `pdf-reader.tsx:163-201` : lancer `const pdfRes = fetch(url)` en tout début d'effet, créer `new pdfjs.PDFWorker()` dès l'import, puis `getDocument({ data: new Uint8Array(await (await pdfRes).arrayBuffer()), worker, … })` ; progression recalculée sur le flux, `setError` si `!res.ok`, `worker.destroy()` et `AbortController` au nettoyage. Rien n'est perdu : sans plages (PERF-06), PDF.js attend déjà le fichier complet. À revoir si PERF-06 est fait.
  4. Éviter `<link rel="preload" as="fetch">` vers `/api/pdf` (double téléchargement possible sous Safari).
- **Verdict** : confirmé ; tailles brotli de l'auditeur inexactes, sévérité faible juste.

#### PERF-18 — Rafale de préchargements RSC en no-store dès l'arrivée sur une page (16 sur l'accueil)

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/page.tsx:25-32` ; `src/components/theme-grid.tsx:12` ; `src/components/site-header.tsx:15` ; `src/components/header-nav.tsx:12` ; `src/components/site-footer.tsx:16,21`
- **Preuve** : accueil mobile, 16 requêtes `?_rsc=` (6,9 KiB) selon Lighthouse, 13 selon la vérification sur iPhone 13 et 21 en 1440×900 : exemples `/search?q=…`, `/theme/*`, logo, `/search`, pied de page. Toutes en `private, no-store`, `x-vercel-cache: MISS`. Aucun `prefetch` dans `src/`. Les paires de requêtes ne sont pas des doublons : arbre de routes puis en-tête de page (cache de segments de Next 16).
- **Impact** : 12 à 21 invocations serverless de quelques millisecondes par vue de l'accueil (pas de rendu de layout ni d'appel OpenAlex/Firestore) : effet sur le quota d'invocations, pas sur la latence. Sans `loading.tsx` sur `/search` et `/theme`, ces préchargements ne rapportent rien.
- **Recommandation** :
  1. `prefetch={false}` sur `page.tsx:27` (exemples), `site-footer.tsx:16,21`, `site-header.tsx:15`, `header-nav.tsx:12`.
  2. `theme-grid.tsx:12` : soit `prefetch={false}`, soit (mieux) ajouter `src/app/theme/[slug]/loading.tsx` et `src/app/search/loading.tsx` et garder le préchargement, qui affichera alors le squelette instantanément.
  3. `prefetch={false}` coupe aussi le préchargement au survol ; pour le garder, un composant client qui appelle `router.prefetch(href)` sur `onMouseEnter`/`onFocus`/`onTouchStart`.
  4. PERF-01 ne suffit pas : `/search` et `/theme/[slug]` restent dynamiques.
- **Verdict** : partiel. Phénomène réel ; les doublons n'en sont pas, coût par appel minime.

#### PERF-20 — SDK Anthropic importé statiquement dans /api/summary pour un fournisseur de secours inactif en production

- **Sévérité** : faible · **Effort** : S · **Vérification** : confirmé
- **Emplacement** : `src/app/api/summary/route.ts:1,64-66,79-98`
- **Preuve** : `import Anthropic from "@anthropic-ai/sdk"` en tête de route, alors qu'il ne sert que si `provider === "anthropic"` ; `/api/health` indique `mistralKey: true`. Tracé nft : 150 fichiers et 2 149 972 octets pour `/api/summary`, contre 145 fichiers et 1 893 297 octets pour `/api/suggest` (+256 Ko). Chunk serveur `_0bhswks._.js` (208 683 octets) contenant le SDK. `require("@anthropic-ai/sdk")` : 26 à 51 ms en local.
- **Impact** : démarrage à froid un peu plus lent et bundle plus gros pour du code jamais exécuté, sur cette seule route.
- **Recommandation** :
  - Option recommandée : retirer Anthropic. Dans `route.ts`, supprimer l'import (l.1), les l.64-66 et `completeAnthropic` (l.79-98), appeler directement `completeOpenAiCompatible`. Dans `ai.ts`, retirer `"anthropic"` du type `Provider` (l.7), de `activeProvider` (l.31), de `LABELS` (l.39), simplifier `modelFor` (l.52) et les `Exclude<Provider, "anthropic">`. Retirer `@anthropic-ai/sdk` de `package.json` (l.13) puis `npm install`. Vérifier que le tracé revient à ~1,89 Mo.
  - Si on garde le secours : `const { default: Anthropic } = await import("@anthropic-ai/sdk")` dans `completeAnthropic`, avec traduction locale des erreurs en `AiError` (supprime l'évaluation au démarrage, pas la taille du bundle).
- **Verdict** : confirmé, sévérité faible.

#### PERF-21 — WelcomeDialogContent importé statiquement, contrairement à ce qu'annonce son commentaire

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/components/welcome-dialog.tsx:4` ; `src/components/welcome-dialog-content.tsx:7-10`
- **Preuve** : `import WelcomeDialogContent from "@/components/welcome-dialog-content"`, alors que le fichier se dit « Chargé à la demande … uniquement à la première visite ». La chaîne « Un compagnon, pas un raccourci » est dans un chunk initial partagé chargé sur toutes les pages. Le commit f3ae9aa avait passé le contenu en `dynamic()` ; le commit 0a474b8 est revenu à l'import direct parce que le chargement différé dégradait le Speed Index mobile.
- **Impact** : quelques Ko payés par les visiteurs déjà accueillis (Dialog est déjà chargé par SignInDialog) ; surtout, un commentaire trompeur qui pousserait un futur audit à défaire un choix mesuré.
- **Recommandation** (S, 10 min) : garder l'import statique. Corriger le commentaire de `welcome-dialog-content.tsx:7-10` : « Contenu de la fenêtre d'accueil, importé directement par WelcomeDialog : le chargement différé retardait l'affichage à la première visite (Speed Index mobile, cf. commit 0a474b8). » Ajouter une ligne au-dessus de l'import de `welcome-dialog.tsx:4` pour dire que le choix est voulu.
- **Verdict** : partiel. Faits exacts, mais ce n'est pas une optimisation oubliée : seul le commentaire est en défaut (hygiène de code plutôt que performance).

#### PERF-22 — Recherche avec contexte (sujet, citations, auteur) : l'en-tête bloque la page et retarde la recherche elle-même

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/search/page.tsx:23-27,33-41` ; `src/lib/openalex.ts:359,413-440`
- **Preuve** : `await Promise.all([getTopic…, getWork(params.cites)…, getAuthorProfile…])` s'exécute avant tout rendu (pas de `loading.tsx` sous `search/`) : SearchBox et `<Results>` ne partent qu'après, et `searchWorks` démarre en série. `getAuthorProfile` enchaîne `/authors` puis `/institutions`. Mesure avec un auteur jamais consulté : 0,55 s de TTFB à froid contre 0,27 s à chaud (~0,28 s de retard dû au contexte).
- **Impact** : latence de 0,3 à 0,5 s sur les liens partagés ou directs et la première visite d'un sujet ; `?cites=` et `?author=` sont en général déjà en cache (la fiche et la carte auteur viennent de faire les mêmes appels).
- **Recommandation** :
  1. Supprimer l'`await Promise.all` des l.23-27 et rendre le contexte dans un composant serveur asynchrone :
     ```tsx
     {(params.topic || params.author || params.cites) && (
       <Suspense fallback={<Skeleton className="h-[22px] w-72" />}>
         <SearchContext topic={params.topic} author={params.author} cites={params.cites} q={params.q} />
       </Suspense>
     )}
     ```
     Le squelette réserve la hauteur d'une ligne pour ne pas décaler les résultats.
  2. Garder `getWork` et `getAuthorProfile` tels quels : un `select` réduit changerait la clé de cache et rendrait le contexte toujours froid.
  3. Optionnel : `{ select: "id,display_name" }` dans `getTopic` (seul appelant).
- **Verdict** : partiel. Cascade confirmée ; deux recommandations initiales (select allégé, suppression de `/institutions`) étaient contre-productives.

#### PERF-23 — /compte lit deux fois le document users/{uid}

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/compte/page.tsx:18-39` ; `src/lib/favorites.ts:52-57`
- **Preuve** : dans le même `Promise.all`, `memberSince(uid)` et `countFavorites(uid)` lisent chacun `users/{uid}` (une 3e fois via `listFavoriteIds` si `favoritesCount` manque).
- **Impact** : une lecture Firestore en trop par affichage, sans effet sur la latence (lectures parallèles).
- **Recommandation** (priorité basse, à grouper avec un nettoyage) : ajouter dans `favorites.ts` `accountSummary(uid)` qui lit `users/{uid}` une fois et renvoie `{ createdAt, favoritesCount }` (repli sur `listFavoriteIds` si le compteur manque) ; l'utiliser dans `compte/page.tsx`, supprimer `memberSince` (l.18-27) et `countFavorites`, désormais sans appelant.
- **Verdict** : partiel. Seule la lecture en double est réelle ; `/api/favorites` et les « 3 getUser » ne sont pas propres à cette page.

#### PERF-24 — Firestore passe par gRPC (par défaut) : démarrage à froid plus lourd qu'avec REST

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/lib/firebase/admin.ts:44-46`
- **Preuve** : `getFirestore(await adminApp())` sans `preferRest`. Aucun listener côté serveur (seul cas qui exige gRPC). Mesure de vérification (démarrage complet du client, hors réseau) : gRPC 116–124 ms à chaud (203 ms au premier lancement), REST 76–82 ms.
- **Impact** : ~40 ms à chaud, jusqu'à ~120 ms à froid, par instance, sur la première requête Firestore.
- **Recommandation** : remplacer le corps de `adminDb()` par
  ```ts
  const { initializeFirestore } = await import("firebase-admin/firestore");
  return initializeFirestore(await adminApp(), { preferRest: true });
  ```
  (sans risque à chaque requête : même réglage, même instance). **Ne pas** appeler `db.settings({ preferRest: true })` dans `adminDb()` : le second appel lève « You can only call settings() once » et casse toutes les routes connectées. Alternative sans code : `FIRESTORE_PREFER_REST=true` dans Vercel. Vérifier ensuite sur un aperçu `recursiveDelete` et les transactions, et comparer la première requête à froid dans les journaux.
- **Verdict** : partiel. Constat exact ; chiffres initiaux fragiles (cache disque froid) ; recommandation initiale dangereuse, corrigée ici.

#### PERF-25 — /api/recommendations renvoie des objets Work complets alors que la carte compacte n'en affiche qu'une petite partie

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/api/recommendations/route.ts:89,94,116` ; `src/lib/openalex.ts:316,335` ; `src/components/work-card.tsx:27`
- **Preuve** : mesure (`?fav=W2741809807,W2194775991`) : 61 469 à 66 103 octets de JSON pour 6 articles, dont ~35 Ko d'`authorships` (la carte n'affiche que 2 auteurs) et ~12–14 Ko d'`abstract_inverted_index` (jamais affiché en variante compacte). Servi en brotli : 12 689 octets.
- **Impact** : ~10 Ko transférés en trop par affichage de l'accueil pour un utilisateur ayant un historique ; ~75 % du JSON décompressé inutile.
- **Recommandation** :
  1. `openalex.ts` : `RECO_SELECT` = `LIST_SELECT` sans `abstract_inverted_index`, utilisé par `getQualityWorksByIds` (l.316) et `getRecentByTopic` (l.335).
  2. `route.ts` (l.89, 94) : alléger chaque Work avec une fonction `slim` qui garde le nom de chaque auteur (au plus 50), `doi`, `open_access`, `primary_topic` et le `display_name` des sources, et vide institutions et affiliations. **Ne pas** tronquer à 3 auteurs : « et N autres » et l'instantané de favori (APA, BibTeX) en dépendent.
  3. `work-card.tsx:27` : ne calculer le résumé que si `!compact`.
  Gain mesuré : ~12,7 Ko → ~2 Ko en brotli.
- **Verdict** : partiel. Mesure confirmée en octets bruts ; la troncature à 3 auteurs proposée à l'origine aurait faussé l'affichage et les favoris.

#### PERF-26 — Lecteur : écouteurs de sélection sur le défilement, avec calculs et re-rendus à la fréquence du scroll

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/components/highlights/pdf-reader.tsx:218-242,253-261,330-332,348` ; `src/components/highlights/highlightable-abstract.tsx:62-83` ; `src/components/highlights/selection-button.tsx:37-43`
- **Preuve** : `window.addEventListener("scroll", update, { passive: true })`. Avec une sélection, chaque événement appelle `readSelection` puis `setSelection({...})`, et `PdfReader` re-rend ses `PdfPage` non mémoïsées ; `prefix`/`suffix` sont calculés pour rien (le PDF envoie `prefix: ""`). Sans sélection, un `setTimeout(…, 300)` est créé à chaque événement sans annuler le précédent. Mesure (54 pages, 240 frames) : ~0,4 ms par frame, 1,6–2,2 ms avec CPU ralenti 4× ; loin du budget de 16,7 ms.
- **Impact** : pas de saccade mesurable. En revanche, **bug fonctionnel** relevé à la vérification : un minuteur orphelin efface une sélection valide. Test reproductible : 5 événements scroll, puis sélection de 311 caractères ; bouton « Surligner » présent à 100 ms, disparu à 600 ms alors que la sélection est toujours là. Cas réel : sélection faite moins de 300 ms après un défilement.
- **Recommandation** :
  1. (S, prioritaire) `pdf-reader.tsx:229` et `highlightable-abstract.tsx:70` : `clearTimeout(clearTimer); clearTimer = setTimeout(() => setSelection(null), 300); return;`.
  2. (S) `const PdfPage = memo(function PdfPage(...) {...})` (l.348) : ses props ne changent pas pendant une sélection.
  3. (S, facultatif) Ne pas brancher l'écouteur scroll si `matchMedia("(pointer: coarse)").matches`, ou `setSelection((prev) => …)` qui renvoie `prev` si rien n'a changé.
  4. Ne pas ajouter de throttling `requestAnimationFrame` (scroll déjà cadencé à la frame) ; corriger le commentaire l.253 (« référence stable par page »).
- **Verdict** : partiel. Impact de performance exagéré ; le vrai problème est le bug des minuteurs, non relevé à l'origine.

#### NEW-9 — Firestore : écritures redondantes sur users/{uid} à chaque ajout dans une liste, et aucune exemption d'index

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/lib/favorites.ts:73-86` ; `src/lib/collections.ts:106-107` ; `firebase.json` (pas de bloc `indexes`, pas de `firestore.indexes.json`)
- **Preuve** : `addFavoriteIn` réécrit toujours `users/{uid}` (`favoriteIds` complet, jusqu'à 1 000 identifiants, ~12 Ko) et `favorites/{id}`, même si l'article est déjà favori. Ranger un favori existant dans 3 listes coûte 9 écritures au lieu de 3, et les transactions se disputent le même document. Sans `fieldOverrides`, tous les champs sont indexés, y compris `favoriteIds`, `highlights.text` (≤ 3 000 caractères), `notes.text`, `feedback.description`, jamais interrogés.
- **Impact** : écritures en trop (coût négligeable au volume actuel) ; contention lors de cases cochées rapidement (latence, relances ; un 502 reste improbable, firebase-admin relance 5 fois). Stockage d'index et latence d'écriture inutiles, marginaux.
- **Recommandation** :
  1. (S) `favorites.ts:79-86`, n'écrire que ce qui change :
     ```ts
     const isNewId = !ids.includes(s.id);
     if (isNewId) { if (!existing.exists && ids.length >= MAX_FAVORITES) throw new FavoritesLimitError(...); ids.push(s.id); }
     if (isNewId || !Array.isArray(known)) tx.set(userRef, { favoriteIds: ids, favoritesCount: ids.length }, { merge: true });
     const d = existing.data() ?? {};
     const unchanged = existing.exists && (["title","authors","venue","year","doi","type","isOa","citedByCount","topic"] as const).every((k) => d[k] === s[k]) && JSON.stringify(d.authorNames ?? []) === JSON.stringify(s.authorNames);
     if (!unchanged) tx.set(favRef, { ...s, addedAt: previous ?? FieldValue.serverTimestamp() }, { merge: true });
     ```
  2. (S, facultatif) `firebase.json` : `"indexes": "firestore.indexes.json"`, avec des `fieldOverrides` à `indexes: []` pour `users.favoriteIds`, `highlights.text/note/prefix/suffix/article`, `notes.text/article`, `feedback.description` (pas de joker possible) ; lancer `firebase firestore:indexes` avant de déployer.
- **Verdict** : partiel. Cœur exact ; impact coût et contention exagéré.

#### NEW-10 — Ni favicon.ico, ni apple-touch-icon, ni manifeste, ni theme-color : chaque demande automatique des navigateurs déclenche un rendu 404 dynamique

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/` (seulement `icon.svg`) ; `src/app/layout.tsx:12-16` (ni `viewport` ni `themeColor`)
- **Preuve** : en production, `/favicon.ico`, `/apple-touch-icon.png`, `/manifest.webmanifest`, `/manifest.json` (et `/robots.txt`) → 404 de ~31,5 Ko en `private, no-store`, `x-matched-path: /_not-found`, `x-vercel-cache: MISS`, exécuté en iad1. Le `<head>` ne contient qu'une icône SVG, sans `theme-color`.
- **Impact** : une invocation serverless et ~31 Ko non mis en cache par sonde (vieux Safari, iOS, robots, lecteurs de flux, aperçus de liens ; Chrome, Edge, Firefox utilisent le SVG). L'ajout à l'écran d'accueil donne une capture floue ; la barre du navigateur mobile ne suit pas le thème.
- **Recommandation** :
  1. `public/favicon.ico` (16, 32, 48 px, généré depuis `src/app/icon.svg`).
  2. `public/apple-touch-icon.png` 180×180, opaque, fond #1D1F2A (dans `public/` pour que l'URL racine réponde 200) ; `icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" }` dans `metadata`.
  3. `src/app/manifest.ts` (`MetadataRoute.Manifest` : `name`/`short_name` « Sextant », `lang: "fr"`, `start_url: "/"`, `background_color: "#F8F6F0"`, `theme_color: "#1D1F2A"`, icônes 192 et 512 dont une `maskable`).
  4. `layout.tsx` : `export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#F8F6F0" }, { media: "(prefers-color-scheme: dark)", color: "#0A0A0A" }] };`
  5. Ajouter `src/app/robots.ts` (QUAL-17). Vérifier ensuite `curl -sI …/favicon.ico` : 200, cache public, HIT au 2e appel.
- **Verdict** : partiel. Faits confirmés ; portée exagérée (les navigateurs modernes ne sondent pas `/favicon.ico`), coût réel faible.

### 4.3 Accessibilité

#### A11Y-01 — En-tête trop large sur mobile : défilement horizontal sur toutes les pages en dessous d'environ 435 px

- **Sévérité** : élevée · **Effort** : S · **Vérification** : confirmé
- **Emplacement** : `src/components/site-header.tsx:15-29` ; `src/components/auth/auth-button.tsx:52-54` ; `src/components/header-nav.tsx:16-20`
- **Preuve** : Playwright déconnecté, à 320, 360, 375, 390, 414 et 430 px : `documentElement.scrollWidth` vaut 436 px sur toutes les pages. Bloc de droite (Recherche, thème, « Se connecter ») de x=175 à x=436 (`gap-6`, `px-4`) ; la div `flex-1` du champ masqué (`hidden md:block`) reste dans le flux avec une largeur de 0 et coûte un écart de 24 px. En production sur `/a-propos` à 375 px : scrollWidth 436, bouton coupé à « Se co… ». Connecté : 388 px. Ni `body` ni `html` n'ont d'`overflow-x`. Effet de bord relevé à la vérification : en émulation Android, la fenêtre d'accueil est centrée sur 436 px et coupée à droite.
- **Impact** : échec WCAG 1.4.10 (AA) sur la plupart des téléphones (360–414 px) : toute la page glisse latéralement, boutons thème et compte à moitié hors écran, seul bouton de connexion inaccessible sans défilement à 320–360 px.
- **Recommandation** :
  1. `site-header.tsx:16` : `gap-3 sm:gap-6`.
  2. `site-header.tsx:19` : `<span className="hidden text-lg font-semibold tracking-tight sm:inline">Sextant</span>` (le lien garde `aria-label="Sextant, accueil"`).
  3. `site-header.tsx:21` : `<div className="hidden flex-1 justify-center md:flex">` et `ml-auto` sur le bloc de droite (l.24).
  4. `auth-button.tsx:52-54` : `<UserRoundIcon aria-hidden /><span className="sr-only sm:not-sr-only">Se connecter</span>` avec `max-sm:size-8 max-sm:px-0` sur le bouton.
  5. Option : même traitement pour « Recherche » dans `header-nav.tsx:20` (icône `SearchIcon` sous sm).
  Largeurs obtenues à 320 px : ~237 px déconnecté, ~277 px connecté. Contrôler `scrollWidth <= clientWidth` à 320, 360, 375 px connecté et déconnecté sur `/`, `/a-propos`, `/search`, idéalement en test Playwright (QUAL-43). `/search` et `/theme/*` gardent un second débordement (A11Y-02).
- **Verdict** : confirmé par deux vérifications indépendantes, en local et en production.

#### A11Y-02 — Grilles sans colonne de base : l'accueil et /search débordent à 375 et 320 px

- **Sévérité** : élevée · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/components/for-you.tsx:82,86,93` ; `src/components/results.tsx:66` ; `src/components/work-card.tsx:52` ; préventif : `src/app/page.tsx:68,80`, `src/components/recently-viewed.tsx:41`, `src/app/article/[id]/page.tsx:291,303`, `src/app/compte/page.tsx:64`
- **Preuve** : `grid gap-3 sm:grid-cols-2 lg:grid-cols-3` sans `grid-cols-1` : sous sm, la piste implicite `auto` prend la largeur min-content des enfants insécables. Mesures : à 375 px, le `li` de `#pour-vous` fait 710 px et `scrollWidth` 726 px (le navigateur dézoome la page à ~52 %) ; cause, `p.min-w-0.truncate` de `for-you.tsx:93`. Sur `/search` (et `/theme/*`), colonne de 360–377 px à 320 et 375 px, due aux `span.truncate` du sujet dans `WorkCard` et à la pagination, pas aux Select. Avec `repeat(1, minmax(0, 1fr))`, retour à 288/343 px. Les 7 autres grilles ne débordent pas aujourd'hui.
- **Impact** : l'accueil de tout visiteur avec historique ou favoris double de largeur sur mobile ; `/search` et `/theme` échouent à WCAG 1.4.10 dès 375 px.
- **Recommandation** :
  1. `for-you.tsx:86` et `:82` : `grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3`.
  2. `results.tsx:66` : `grid grid-cols-1 gap-8 lg:grid-cols-[220px_minmax(0,1fr)]` (`1fr` seul vaut `minmax(auto,1fr)`).
  3. Par précaution, `grid-cols-1` sur les autres grilles citées.
  4. Traiter l'en-tête (A11Y-01), sans quoi le défilement horizontal subsiste.
  5. Vérifier `scrollWidth === clientWidth` à 320 et 375 px sur `/`, `/search?q=climate%20change`, `/theme/<slug>`, avec et sans session.
- **Verdict** : partiel. Débordement confirmé sur 2 grilles sur 9 (et à 375 px sur `/search`, pire qu'annoncé) ; cause sur `/search` mal attribuée à l'origine.

#### A11Y-03 — Indicateur de focus quasi invisible : contour à 50 % d'opacité (1,82:1 en clair, 2,05:1 en sombre), rien de plus sur les liens

- **Sévérité** : moyenne · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/globals.css:77,116,134` ; `src/components/ui/button.tsx:6` ; `src/components/ui/input.tsx:11` ; `src/app/article/[id]/page.tsx:217-225`
- **Preuve** : `* { @apply border-border outline-ring/50; }`. Style calculé d'un lien focalisé : `outline: auto 1px oklab(0.6 -0.019 -0.139 / 0.5)`, sans box-shadow : #a5bae2 sur #f9f6f1 = 1,82:1, #314469 sur #0a0a0a = 2,05:1. À pleine opacité, `--ring` atteint 3,72:1 et 4,97:1. Aucun style `focus-visible` dans header-nav, work-card, theme-grid, recently-viewed, for-you, search-box, site-footer, favorites-link, favorites-list, feedback-board, highlight-item ; les badges de sujets de la fiche sont enveloppés dans un `<Link>` nu. Boutons et champs gardent un liseré `border-ring` conforme.
- **Impact** : sur les liens (majorité des éléments interactifs), repérage difficile de l'élément focalisé, surtout en sombre ; manquement à WCAG 1.4.11 (et RGAA 10.7). WCAG 2.4.7 est respecté (un indicateur existe partout).
- **Recommandation** :
  1. `globals.css:134` : `@apply border-border outline-ring;`.
  2. Dans le même `@layer base` : `:focus-visible { outline-style: solid; outline-width: 2px; outline-offset: 2px; }` (les primitives `ui/*` en `outline-none` gardent leur anneau).
  3. Foncer `--ring` : l.77 `oklch(0.5 0.16 262)` (#2c5dbd, 5,73:1) ; l.116 `oklch(0.7 0.12 262)` (#759ee9, 7,35:1).
  4. Vérifier les cartes arrondies (theme-grid, work-card, for-you, recently-viewed) ; passer à `outline-offset: -2px` localement si un parent rogne.
- **Verdict** : partiel. Chiffres exacts ; « quasi invisible » vrai en sombre seulement ; sévérité ramenée à moyenne.

#### A11Y-04 — Langue des passages non déclarée : titres et résumés en anglais lus avec la voix française

- **Sévérité** : moyenne · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/article/[id]/page.tsx:110,195` ; `src/components/highlights/highlightable-abstract.tsx:98,102` ; `src/components/work-card.tsx:56,72` ; `src/app/article/[id]/lire/page.tsx:42`
- **Preuve** : sur `/article/W4406431707` : `<html lang="fr">`, h1 « Cancer statistics, 2025 », résumé anglais (« Résumé · en anglais »), `document.querySelectorAll("main [lang]").length === 0`. `grep ' lang='` ne trouve que `layout.tsx:24`. `work.language` est pourtant sélectionné (openalex.ts:131) et déjà affiché (page.tsx:123,190 ; work-card.tsx:66).
- **Impact** : échec de WCAG 3.1.2 (AA) : NVDA et JAWS lisent titres et résumés étrangers avec la phonétique française. Contenu toujours accessible, prononciation dégradée ; VoiceOver iOS compense en partie.
- **Recommandation** :
  - `page.tsx:110` : `<h1 lang={work.language ?? undefined} …>`.
  - `page.tsx:195` : passer `lang` à `<HighlightableAbstract>`, le poser sur le `<p ref>` (l.98) et mettre `lang="fr"` sur les `span.sr-only` « Début/Fin du passage surligné » (l.102), sinon ils seraient lus en anglais.
  - `work-card.tsx:56` (h3) et `:72` (extrait), `lire/page.tsx:42` (h1) : même attribut.
  - Laisser le condensé IA en français ; `lang` sur le `<blockquote>` de `highlight-item.tsx:72` quand la source est le résumé.
  - (M, hors lot) champ optionnel `language` dans `FavoriteSnapshot`, `snapshotFromWork`, `sanitizeSnapshot` pour `/liste` et les favoris.
  - Ne pas traiter `search-box.tsx` (l'autocomplétion OpenAlex ne fournit pas la langue).
  - Vérifier `main [lang]` ≥ 2 sur la fiche, puis à l'oreille.
- **Verdict** : partiel. Échec réel ; sévérité ramenée à moyenne ; `search-box.tsx:197` non corrigeable simplement ; la langue OpenAlex est détectée automatiquement et parfois fausse.

#### A11Y-05 — Fiche auteur au survol : elle se ferme dès que le focus y entre et ne répond pas à Échap, ses liens sont inaccessibles au clavier

- **Sévérité** : moyenne · **Effort** : M · **Vérification** : partiel
- **Emplacement** : `src/components/author-chip.tsx:41-48,59-67,74-94`
- **Preuve** : `onFocus={show}` et `onBlur={hide}` sur le bouton (l.78-79), `hide()` ferme après 160 ms ; le conteneur n'a que `onMouseEnter`/`onMouseLeave` (l.74). Aucun `onKeyDown`. Mesure sur `/article/W2246596825` : focus sur « Donald H. Marx » → `aria-expanded=true` ; passage au premier lien → fiche encore là à 100 ms, retirée du DOM à 350 ms, `activeElement = BODY`. Échap sans effet. Entrée après le focus (180 ms) referme la fiche. `role="dialog"` sur un span non focalisable.
- **Impact** : au clavier et au lecteur d'écran, « Tous ses articles sur Sextant » (seul accès au filtre `/search?author=` du site), « Profil ORCID », « Chercher sur Wikipédia » et le site de l'institution sont inatteignables : échec WCAG 2.1.1 (A), et 1.4.13 non respecté (pas de fermeture par Échap). Fonction secondaire d'une seule page.
- **Recommandation** :
  - Option conseillée : réécrire avec `@base-ui/react/popover` (1.8.0 installé) : `<Popover.Trigger openOnHover delay={180} closeDelay={160} render={<button type="button" …/>}>`, `` <Popover.Popup aria-label={`À propos de ${name}`}> `` dans un Positioner `side="bottom" align="start" sideOffset={8}`. Base UI gère Échap et retour du focus, clic extérieur, Entrée/Espace, `aria-expanded`/`aria-controls`. Supprimer `show`, `hide`, `timer`, `wrapRef` et les gestionnaires ; charger le profil au premier `open`. Ne pas utiliser PreviewCard.
  - Option minimale : supprimer `onFocus={show}` ; déplacer le blur sur le conteneur avec `if (!wrapRef.current?.contains(e.relatedTarget as Node)) hide();` ; `onKeyDown` Échap qui ferme et rend le focus au bouton ; annuler le minuteur dans l'effet pointerdown ; motif de divulgation (`aria-controls`, retrait de `role="dialog"`).
  - Tester Tab/Entrée/Échap/Maj+Tab et le survol souris.
- **Verdict** : partiel (deux vérifications). Défaut confirmé ; « le focus repart en haut du document » exagéré (le Tab suivant reprend près de la puce) ; sévérité ramenée à moyenne.

#### A11Y-06 — Note d'un passage : l'aria-label cache le texte de la note aux lecteurs d'écran

- **Sévérité** : moyenne · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/components/highlights/highlight-item.tsx:104-108`
- **Preuve** : `<button … aria-label={h.note ? "Modifier la note" : "Ajouter une note"}>{h.note || "Ajouter une note…"}</button>` : l'`aria-label` remplace le contenu dans le nom accessible, la note n'est exposée nulle part ailleurs. Composant utilisé sur `/citations`, dans « Mes surlignages » de la fiche et dans la barre latérale du lecteur.
- **Impact** : le lecteur d'écran n'annonce que « Modifier la note, bouton » ; il faut ouvrir chaque note en édition pour la relire. Échec WCAG 2.5.3 (A) quand une note existe (le texte visible n'est pas dans le nom).
- **Recommandation** : sortir la note du bouton (une note de 1 000 caractères ferait un nom interminable) :
  ```tsx
  ) : h.note ? (
    <div className="mt-2 flex items-start gap-2 pl-6">
      <p className="flex-1 text-sm whitespace-pre-line text-foreground"><span className="sr-only">Votre note : </span>{h.note}</p>
      <Button variant="ghost" size="sm" onClick={startEditing}>Modifier la note</Button>
    </div>
  ) : (
    <button type="button" onClick={startEditing} className="mt-2 block w-full rounded-md pl-6 text-left text-sm text-muted-foreground italic hover:text-foreground">Ajouter une note…</button>
  )
  ```
  Sans `aria-label`. Rendre ensuite le focus au bouton « Modifier la note » après `saveNote`/`cancelNote` (ref + `focus()` dans un effet sur `editing`).
- **Verdict** : partiel. Mécanisme confirmé ; « impossible de relire » exagéré (le Textarea d'édition expose la valeur) ; sévérité moyenne.

#### A11Y-08 — L'élément focalisé passe sous l'en-tête collant en navigation arrière (aucun scroll-padding)

- **Sévérité** : moyenne · **Effort** : S · **Vérification** : confirmé
- **Emplacement** : `src/components/site-header.tsx:15-16` ; `src/app/globals.css:139-141`
- **Preuve** : en-tête `sticky top-0 z-40 h-16`, `scrollPaddingTop` = `auto`. Playwright sur `/article/W4406431707` (1440×900) : après Maj+Tab, le bouton « Favori » focalisé occupe les pixels 3 à 39 alors que l'en-tête descend à 64 px. `/search?q=climate` : 5 arrêts entièrement masqués et 4 à moitié (9 et 8 à 390×844), y compris le champ de recherche. Avec `html{scroll-padding-top:5rem}` injecté, 0 arrêt masqué sur 6 combinaisons.
- **Impact** : en remontant au clavier, le focus disparaît sous l'en-tête sur toutes les pages (WCAG 2.4.11, AA en 2.2).
- **Recommandation** :
  1. `globals.css:139-141` : `html { @apply font-sans scroll-pt-20; }` (64 px d'en-tête + 16 px).
  2. Supprimer les marges par section qui s'ajouteraient : `scroll-mt-20` dans `src/app/page.tsx:38,43`, `for-you.tsx:70`, `recently-viewed.tsx:22` ; `scroll-mt-24` dans `compte/page.tsx:74` (ou `scroll-mt-4`).
  3. Vérifier Maj+Tab depuis le pied de page sur la fiche et `/search`, en 390×844 et 1440×900, et l'ancre `#lecteur-surlignages`.
- **Verdict** : confirmé. La non-reproduction par un autre relecteur s'explique par la fenêtre d'accueil qui piège le focus à la première visite. Firefox et WebKit non mesurés.

#### A11Y-09 — Suggestions de recherche : liens imbriqués dans les options, aria-controls qui pointe dans le vide, nombre de suggestions non annoncé

- **Sévérité** : moyenne · **Effort** : M · **Vérification** : partiel
- **Emplacement** : `src/components/search-box.tsx:147-150,163-211`
- **Preuve** : axe sur `/` après saisie de « climat » : `nested-interactive` (serious, WCAG 4.1.2) sur 7 nœuds, par exemple `<li role="option" aria-selected="true"><a href="/search?q=climat">`, soit 7 arrêts de tabulation en plus. `aria-controls` désigne une liste absente tant qu'elle est fermée (hygiène seulement : axe 4.13 ne le signale pas quand `aria-expanded="false"`). Aucune région de statut n'annonce le nombre de suggestions.
- **Impact** : annonces incohérentes (option contenant un lien, ignorée par VoiceOver), navigation clavier allongée, arrivée des suggestions non signalée. Fonction centrale, présente sur toutes les pages via l'en-tête.
- **Recommandation** :
  1. Donner le rôle option au lien : `` <li key={item.href} role="none"><Link href={item.href} id={`${listId}-${i}`} role="option" aria-selected={i === active} tabIndex={-1} …> `` (garde préchargement et Cmd-clic). Un `tabIndex={-1}` seul sur le lien imbriqué ne suffit pas pour axe.
  2. Fermer la liste quand le focus quitte le composant (A11Y-10).
  3. `aria-controls={showList ? listId : undefined}`.
  4. Région rendue en permanence, hors du bloc `showList` : `` <p role="status" className="sr-only">{showList ? `${items.length} suggestion${items.length > 1 ? "s" : ""}` : ""}</p> ``.
  5. Alternative plus lourde (M) : le Combobox de `@base-ui/react`, déjà installé.
- **Verdict** : partiel. Liens imbriqués et absence d'annonce confirmés ; volet `aria-controls` surévalué ; le correctif initial était en partie inopérant.

#### A11Y-10 — Suggestions de recherche : la liste reste ouverte quand le focus quitte le champ et masque l'élément focalisé

- **Sévérité** : moyenne · **Effort** : S · **Vérification** : confirmé
- **Emplacement** : `src/components/search-box.tsx:72-79,109-110,115,141,171`
- **Preuve** : la liste ne se ferme que sur `pointerdown` extérieur, Échap dans le champ ou sélection ; pas de `onBlur`. Test : « climat » saisi, focus sur le lien « télétravail et bien-être » → liste ouverte, `elementFromPoint` au centre du lien renvoie la liste. Après 9 Tab, la listbox (440 px, `z-50`) couvre toujours le h1 de la fiche. Échap n'est écouté que sur l'Input. Sur `/search` et `/theme`, le champ prérempli ouvre la liste au simple passage du focus (l.141).
- **Impact** : élément focalisé masqué (WCAG 2.4.11), sans fermeture possible sans revenir au champ : vrai échec AA, systématique au clavier.
- **Recommandation** :
  1. Conteneur l.115 : `onBlur={(e) => { if (!wrapRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false); }}` et `onKeyDown={(e) => { if (e.key === "Escape" && open) { setOpen(false); inputRef.current?.focus(); } }}`.
  2. Sur le `<Link>` des options (l.171) : `onMouseDown={(e) => e.preventDefault()}`, sinon sous Safari macOS le blur (`relatedTarget` nul) fermerait la liste avant le clic.
  3. `tabIndex={-1}` sur les options (motif combobox, flèches via `aria-activedescendant`).
  4. Option : ne rouvrir au focus que si l'utilisateur a saisi quelque chose (`if (query !== defaultValue) setOpen(true)`).
  5. Tester Tab, Tab depuis « climat » (`aria-expanded=false`) et un clic sur une suggestion dans Safari.
- **Verdict** : confirmé ; Échap inopérant hors du champ aggrave le constat.

#### A11Y-12 — Changements de résultats non annoncés (filtres, tri, pagination), focus renvoyé sur body, squelettes sans statut

- **Sévérité** : moyenne · **Effort** : M · **Vérification** : confirmé
- **Emplacement** : `src/components/results.tsx:70,94-137` ; `src/components/pagination.tsx:25` ; `src/components/search-filters.tsx:65` ; `src/app/search/page.tsx:15` ; `src/app/theme/[slug]/page.tsx:22` ; `src/app/article/[id]/loading.tsx`
- **Preuve** : le compteur « N résultats » et `EmptyState` n'ont ni `role=status` ni `aria-live`, et sont rendus dans `<Suspense key={JSON.stringify(params)}>` qui les remonte à chaque changement. L'annonceur de Next ne parle que si le titre change (app-router-announcer.js:62) : le titre de `/search` ne dépend que de `q`, celui de `/theme` ne change pas avec la page. Sur `/theme/informatique`, Entrée sur « Suivant » → `?page=2`, `activeElement = BODY`, `scrollY` de 6066 à 0, annonce « Informatique » comme en page 1 ; filtre « Accès ouvert » : aucune annonce. `ListSkeleton`, `FeaturedSkeleton` et `loading.tsx` n'ont ni texte ni statut.
- **Impact** : après un filtre, un tri ou une page, l'utilisateur de lecteur d'écran ne sait pas que la liste a changé ni combien de résultats il y a, et doit repartir du haut (35 tabulations avant la première fiche sur `/theme`). Échec WCAG 4.1.3 et problème d'ordre de focus (2.4.3).
- **Recommandation** :
  1. Dans `Results`, hors du `<Suspense>` : `<p id="results-status" role="status" className="sr-only" />`. Composant client `results-status.tsx` qui, dans un `useEffect([message])`, vide puis écrit le message dans un `requestAnimationFrame` (« 1 234 résultats, page 2 sur 500 », et les trois messages d'`EmptyState`).
  2. Dans `List` : `<h2 id="results-heading" tabIndex={-1} className="sr-only">Résultats, page {page}</h2>` ; `ResultsStatus` le focalise au montage seulement si `document.activeElement === document.body` (pagination, « Réessayer »), jamais après un filtre.
  3. `generateMetadata` : ajouter « — page N » au titre de `/search` et `/theme` quand page > 1.
  4. Squelettes : `aria-busy="true"`, `aria-hidden` sur chaque `Skeleton` et `<span className="sr-only">Chargement des résultats…</span>`.
  5. Lien d'évitement : A11Y-11.
- **Verdict** : confirmé ; la perte de focus ne concerne que les liens rendus dans le Suspense (pagination, « Réessayer ») ; 35 tabulations et non 29.

#### A11Y-13 — Erreurs et messages d'état non annoncés : connexion, suppression de compte, condensé IA, « Copié »

- **Sévérité** : moyenne · **Effort** : M · **Vérification** : confirmé
- **Emplacement** : `src/components/auth/sign-in-dialog.tsx:81` ; `src/components/auth/account-actions.tsx:66` ; `src/components/ai-summary.tsx:63-102` ; `copy-button.tsx:33` ; `share-dialog.tsx:60` ; `src/components/account/mcp-keys.tsx:35,51` ; `shared-list-actions.tsx:37` ; `src/components/highlights/highlight-item.tsx:110`
- **Preuve** : erreurs rendues dans un simple `<p className="text-sm text-destructive">`. Dans `AiSummary`, la seule région `aria-live` (l.70) n'existe que pendant le chargement et apparaît déjà remplie ; ni le résultat (l.84) ni l'erreur (l.99) ne sont annoncés, et le bouton « Condenser » est démonté au clic (focus sur `<body>`). « Copié » ne change que le texte du bouton dans 5 fichiers (6 cas) ; dans `highlight-item.tsx:110`, l'`aria-label` fixe le masque. Base UI passe `aria-hidden` sur tout ce qui est hors d'une boîte ouverte, sauf les éléments portant déjà `[aria-live]`.
- **Impact** : un échec de connexion, de suppression de compte ou de génération passe inaperçu ; le condensé IA, fonction phare, arrive sans annonce (WCAG 4.1.3).
- **Recommandation** :
  1. `role="alert"` sur `sign-in-dialog.tsx:81` et `account-actions.tsx:66`.
  2. `ai-summary.tsx` : retirer `aria-live` de la l.70 ; région toujours montée `` <p className="sr-only" aria-live="polite">{loading ? `${providerLabel} lit le résumé…` : state.status === "done" ? "Synthèse prête." : ""}</p> `` ; `role="alert"` sur l'erreur (l.99) ; `ref` + `tabIndex={-1}` sur les blocs résultat (l.84) et erreur (l.98), focalisés quand le statut change.
  3. Hook unique `src/hooks/use-copy.ts` (`copied`, `copy(text, message)`) qui écrit dans une région `<div id="sr-announcer" className="sr-only" aria-live="polite" aria-atomic="true" />` montée dans `layout.tsx` (`aria-live` explicite obligatoire) ; remplacer les 5 copies (copy-button.tsx:22-29, share-dialog.tsx:25-33, mcp-keys.tsx:13-25, shared-list-actions.tsx:14-22, highlight-item.tsx:39-47). Ou `toast.success`, déjà annoncé par sonner.
- **Verdict** : confirmé ; sévérité moyenne (WCAG 4.1.3, AA).

#### A11Y-18 — Surlignage réservé à la sélection à la souris ou au doigt, et bouton flottant non annoncé

- **Sévérité** : moyenne · **Effort** : M · **Vérification** : partiel
- **Emplacement** : `src/components/highlights/selection-button.tsx:21,32` ; `src/components/highlights/highlightable-abstract.tsx:76,98` ; `src/components/highlights/pdf-reader.tsx:235,329` ; `src/components/highlights/article-highlights.tsx:26,49` ; `src/components/highlights/manual-citation-dialog.tsx:44`
- **Preuve** : le bouton « Surligner » n'apparaît que sur `selectionchange` d'une sélection DOM. Le résumé est un `<p>` non focalisable : sans navigation au curseur (F7), rien n'est sélectionnable au clavier ; Safari n'a pas cette navigation. Le bouton apparaît dans un `role="toolbar"` sans région live. Le repli « Ajouter une citation à la main » enregistre `source: "manual"` et demande de recopier le passage, qui n'est alors marqué ni dans le résumé ni dans le PDF.
- **Impact** : au clavier seul ou au lecteur d'écran, la fonction centrale se réduit en pratique à la saisie à la main. Le déclencheur n'est pas spécifique à la souris (F7 + Maj + flèches fonctionne probablement), d'où un échec WCAG 2.1.1 discutable, mais la fonction est peu découvrable.
- **Recommandation** :
  1. (S) Région toujours montée après le `<p>` du résumé et dans le lecteur : `<p role="status" className="sr-only">{selection ? "Passage sélectionné : bouton « Surligner » disponible avec la touche Tab." : ""}</p>` ; retirer `role="toolbar" aria-label="Sélection"` de `selection-button.tsx:21`.
  2. (S) Texte d'aide (`article-highlights.tsx:26,49`, `pdf-reader.tsx:329`) : « Au clavier : activez la navigation au curseur (F7 dans Chrome, Edge ou Firefox), sélectionnez avec Maj + flèches, puis Tab jusqu'à « Surligner ». »
  3. (M) Bouton « Surligner une phrase du résumé… » : Dialog qui découpe le résumé avec `new Intl.Segmenter("fr", { granularity: "sentence" })`, cases à cocher, et `add({ source: "abstract", text, prefix: full.slice(start - 60, start), suffix: full.slice(end, end + 60), page: null, note: "" })` (même format que `readSelection`).
  4. (M) Même alternative pour le PDF via `page.getTextContent()` et `add({ source: "pdf", page, … })`.
- **Verdict** : partiel. Constats techniques exacts ; « aucun équivalent » exagéré ; sévérité moyenne maintenue.

#### A11Y-20 — Toasts « Annuler » visibles 3,5 s seulement

- **Sévérité** : moyenne · **Effort** : S · **Vérification** : confirmé
- **Emplacement** : `src/app/layout.tsx:34` ; `src/components/for-you.tsx:55` ; `src/components/highlights/highlights-provider.tsx:101` ; `src/components/highlights/citations-list.tsx:86` ; `src/components/favorites/favorites-provider.tsx:286`
- **Preuve** : `<Toaster position="bottom-right" duration={3500} />` s'applique aussi aux actions annulables (suggestion écartée, citation supprimée, favori retiré de ses listes). Le toast est la seule façon de revenir en arrière (suppression de citation en un clic, `clearHidden()` jamais appelé). Dans sonner 2.0.8, le focus clavier n'arrête pas le minuteur ; seuls le survol et Alt+T (annoncé dans l'aria-label de la région) le font.
- **Impact** : au clavier, au lecteur d'écran ou avec une motricité réduite, 3,5 s pour trouver « Annuler » (WCAG 2.2.1, niveau A) ; perte de la note et des listes associées sinon.
- **Recommandation** :
  1. `src/lib/undo-toast.ts` : `export const undoToast = (message: string, onUndo: () => void, description?: string) => toast(message, { description, duration: 10_000, closeButton: true, action: { label: "Annuler", onClick: onUndo } });` (avec `duration: Infinity`, le `closeButton` devient obligatoire).
  2. Remplacer les 4 appels ; garder 3 500 ms pour les toasts d'information, 6–8 s pour `toast.error`.
  3. Dans la description : `<span className="sr-only">Alt+T pour atteindre le bouton Annuler.</span>`.
  4. Brancher `clearHidden()` sur « Réafficher les suggestions écartées » ; envisager une confirmation pour une citation qui porte une note.
- **Verdict** : confirmé ; le toast est aussi atteignable par Tab après le pied de page, mais le minuteur ne s'arrête pas.

#### A11Y-22 — Lecteur PDF au lecteur d'écran : texte des pages éloignées effacé, surlignages purement visuels, canevas sans rôle

- **Sévérité** : moyenne · **Effort** : M · **Vérification** : partiel
- **Emplacement** : `src/components/highlights/pdf-reader.tsx:110-133,240-247,358-379,431-435` ; `src/app/globals.css:320`
- **Preuve** : l'IntersectionObserver (`rootMargin: "1200px 0px"`) fait `textRef.current?.replaceChildren()` quand une page s'éloigne (l.371) : seules 3–4 pages (desktop) ou ~7 (mobile) gardent leur texte. `markSpans` n'ajoute que la classe `.hl` (fond jaune), sans repère pour lecteur d'écran, contrairement au résumé. `goToPage` fait défiler sans déplacer le focus.
- **Impact** : les sauts (Ctrl+Fin, navigation rapide) et la recherche du lecteur d'écran échouent, et **Ctrl+F du navigateur ne trouve pas un mot situé sur une page non encore affichée, pour tous les utilisateurs**. La lecture continue fonctionne (défilement automatique). La liste « Mes surlignages » expose déjà le texte des passages (masquée en plein écran).
- **Recommandation** :
  1. (S) Supprimer `textRef.current?.replaceChildren();` (l.371) ; ne libérer que le canevas.
  2. (M, facultatif) Construire en tâche de fond (`requestIdleCallback`) la couche texte des pages jamais affichées, plafonnée (~150 pages).
  3. (S) Dans `markSpans`, `s.setAttribute("role", "mark")` avec la classe `hl`, et `role="presentation"` quand elle est retirée (l.112) ; ne pas insérer de span sr-only dans la couche PDF.js.
  4. (S) `.pdf-page` (l.431) : `` role="group" aria-label={`Page ${pageNumber}`} tabIndex={-1} `` ; `aria-hidden` sur le `<canvas>` ; dans `GOTO_EVENT`, `el.focus({ preventScroll: true })` après le défilement.
  5. Ne pas toucher aux zones `aria-live` (l.306, 435).
- **Verdict** : partiel. Effacement du texte et absence de repère confirmés ; « canevas sans rôle » et `aria-live` sans impact réel. Sévérité moyenne maintenue à cause de Ctrl+F.

#### A11Y-33 — Textes tronqués sans alternative accessible (noms de listes, sujets, raisons « Pour vous », titre du lecteur)

- **Sévérité** : moyenne · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/article/[id]/lire/page.tsx:41-42` ; `src/components/for-you.tsx:82,86,91,93` ; `src/components/results.tsx:66` ; `src/components/work-card.tsx:52` ; `src/components/favorites/favorites-list.tsx:259,337` ; `src/components/highlights/read-pdf-button.tsx:33` ; `src/app/globals.css:147`
- **Preuve** : lecteur, à 375 px sur W3094502228 : `truncate` est neutralisé par `.title-display { text-wrap: balance }` (hors couche), le h1 fait 89 px de large sur 8 lignes, mots coupés (« Transfor… »). Raison « Pour vous » en `truncate` avec `title` : la colonne s'élargit à 710 px (voir A11Y-02) ; une fois corrigée, seuls 38 % du texte restent visibles, le reste uniquement dans `title`. Explication du repli PDF uniquement dans `title` (invisible au tactile).
- **Impact** : à 375 px ou en zoom, informations illisibles ou hachées, accès seulement au survol (WCAG 1.4.10 ; `title` natif exempté de 1.4.13). Noms de listes longs tronqués (impact mineur).
- **Recommandation** :
  1. (S) Grilles : voir A11Y-02 (`grid-cols-1`, `minmax(0,1fr)`, `min-w-0` sur le `li`).
  2. (S) `for-you.tsx:93` : `min-w-0 line-clamp-2 break-words`, texte complet de `reasonText(item.reason)`, retrait du `title`.
  3. (S) Lecteur, h1 : `title-display order-last basis-full break-words text-xl sm:order-none sm:basis-0 sm:flex-1`, sans `title=`.
  4. (S, optionnel) `favorites-list.tsx:259` : `min-w-0 break-words line-clamp-2` ; `read-pdf-button.tsx:33` : ligne visible « Ouverture chez l'hébergeur : le lecteur intégré ne peut pas récupérer ce PDF. » ou au minimum `<span className="sr-only">(s'ouvre dans un nouvel onglet)</span>`.
  5. Ne rien changer à `recently-viewed.tsx:56-57` (titre complet à un clic).
- **Verdict** : partiel. Fond juste mais mécanisme mal diagnostiqué sur 3 emplacements ; critère pertinent : 1.4.10.

#### A11Y-07 — Fenêtre d'accueil modale à la première visite sur toutes les pages, y compris le lecteur et les listes partagées, sans Échap ni clic extérieur

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/components/welcome-dialog.tsx:4,12-21` ; `src/components/welcome-dialog-content.tsx:13-15` ; `src/components/site-header.tsx:31`
- **Preuve** : `<Dialog open onOpenChange={() => undefined} disablePointerDismissal>` et un `onKeyDown` qui annule Échap : on ne sort que par « Compris, je me lance ». Aucune route exclue, contrairement à `mcp-announcement.tsx:21`. Vérifié sur `/conditions` : le reste de la page passe en `aria-hidden`, Échap et clic extérieur sans effet. Lighthouse : le paragraphe de la fenêtre est l'élément LCP de plusieurs pages mobiles, et les scores a11y à 100 n'évaluaient que la fenêtre (fenêtre fermée : `/theme` 95, `/search` 96).
- **Impact** : l'arrivée par un lien partagé (`/liste`, `/lire`) est freinée par un dialogue qui ne suit pas le motif APG (Échap ferme). Pas un piège au sens de 2.1.2 (Tab puis Entrée suffisent) ; audits automatiques de première visite biaisés.
- **Recommandation** :
  1. `welcome-dialog-content.tsx:14-15` : `onOpenChange={(o) => { if (!o) onClose(); }}`, supprimer `disablePointerDismissal` et le `onKeyDown` qui annule Échap (fermeture via `close()`, qui pose `sextant:welcomed`).
  2. `welcome-dialog.tsx` : `usePathname()` et sortie si `/^\/(liste\/|article\/[^/]+\/lire|conditions|confidentialite|mentions-legales)/` ; regex partagée avec `mcp-announcement.tsx:21`.
  3. Garder l'import statique (voir PERF-21, choix mesuré).
  4. Lighthouse : une passe avec `localStorage["sextant:welcomed"]` posé, une sans ; ne pas publier de score a11y mesuré fenêtre ouverte.
- **Verdict** : partiel. Faits confirmés ; aucun critère WCAG violé ; chiffres Lighthouse non remesurés.

#### A11Y-11 — Aucun lien d'évitement : jusqu'à 29 tabulations avant le premier résultat

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/layout.tsx:28-31` ; `src/components/site-header.tsx:15` ; `src/components/results.tsx:70,107`
- **Preuve** : aucun `a[href^="#"]` sur 8 pages, `<main className="flex-1">` sans id. Tabulations avant le premier contenu : 29 sur `/theme/informatique` (dont seulement 5 dans l'en-tête, 24 dans `<main>`), 14 sur `/search` (21 annoncés), 7 sur la fiche. Au clic sur « Suivant », `activeElement` devient BODY et le lien est démonté (Suspense à clé, results.tsx:70).
- **Impact** : les utilisateurs voyants au clavier retraversent l'en-tête et les filtres, et repartent du haut après chaque changement de page. Les landmarks (header, nav étiquetées, main, h1) sont une technique suffisante pour 2.4.1 : l'échec est discutable.
- **Recommandation** :
  1. (Prioritaire) `results.tsx:107` : compteur transformé en `<h2 id="resultats" tabIndex={-1} className="scroll-mt-20 outline-none …">` focalisé quand `params.page` change (voir A11Y-12).
  2. `layout.tsx` : premier enfant de `<body>` `<a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring">Aller au contenu</a>` (un `<a>` natif) et `<main id="contenu" tabIndex={-1} className="flex-1 scroll-mt-16 outline-none">`.
  3. `/search` et `/theme` : lien « Aller aux résultats » (`href="#resultats"`) avant les sujets et filtres.
- **Verdict** : partiel. Absence confirmée ; l'essentiel des arrêts est dans le contenu ; le vrai problème est la perte de focus à la pagination.

#### A11Y-14 — Hiérarchie des titres : aucun h1 sur /search, h1 suivi directement de h3 sur /theme

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/search/page.tsx:29-45` ; `src/components/results.tsx:104-120` ; `src/components/work-card.tsx:56` ; `src/app/theme/[slug]/page.tsx:52`
- **Preuve** : `curl /search?q=climat` : 20 `<h3>`, 0 h1, 0 h2 (axe : `page-has-heading-one` dans les deux thèmes). `/theme/informatique` : h1 « Informatique » suivi du h3 « A Survey of Large Language Models » (axe `heading-order`, score 95).
- **Impact** : navigation par titres qui commence sur un h3 isolé ; la touche « 1 » ne trouve rien sur la page la plus fréquentée. Règles axe de bonne pratique, hors WCAG strict.
- **Recommandation** :
  1. `search/page.tsx`, en tête du bloc l.31 : `` <h1 className="sr-only">{params.q ? `Recherche : « ${params.q} »` : "Recherche"}</h1> ``.
  2. `results.tsx:106` : le compteur devient `<h2 id="resultats" tabIndex={-1} className="text-[15px] font-normal text-muted-foreground outline-none">…</h2>` (h1 → h2 → h3 sans toucher `WorkCard`).
  3. Facultatif : `<h2 className="sr-only">Filtres</h2>` dans l'aside ; titre d'`EmptyState` en h2.
  4. Vérifier 1 h1, ≥ 1 h2, 20 h3 sur `/search?q=climat`.
- **Verdict** : partiel. Faits vérifiés ; rattachement WCAG exagéré ; pas besoin de prop de niveau sur `WorkCard`.

#### A11Y-15 — Rouge « destructive » sous 4,5:1 en thème clair : erreurs, badges « Rétracté » et « Bug », bouton de suppression de compte

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/globals.css:74` ; `src/components/ui/button.tsx:18` ; `src/components/ui/dropdown-menu.tsx:90` ; usages : `article/[id]/page.tsx:102`, `account-actions.tsx:56,69`, `feedback-board.tsx:175`, `article-note.tsx:94`, `favorites-list.tsx:221`
- **Preuve** : `--destructive: oklch(0.577 0.245 27.325)` = #e7000b. Contrastes : 4,42:1 sur le fond (« Non enregistré » en text-xs) ; 3,70:1 sur `bg-destructive/10` (badge « Rétracté », bouton « Supprimer mon compte ») ; 4,01:1 sur popover blanc (« Supprimer définitivement ») ; 3,10:1 au survol ; 4,01:1 pour « Bug » sur secondary. En sombre, `dark:hover:bg-destructive/30` descend à 4,35 et 3,83:1. `ai-summary.tsx:99` est conforme (4,77:1 sur `bg-card`).
- **Impact** : messages critiques moins lisibles en thème clair (WCAG 1.4.3), écarts modestes, chaque message porté aussi par un libellé ou une icône.
- **Recommandation** : `globals.css:74`, bloc `:root` : `--destructive: oklch(0.48 0.2 27.3);` (#b3000b) ; résultats : 6,67:1 sur le fond, 6,04:1 sur secondary, 6,32:1 sur muted, 5,52–5,97:1 sur destructive/10, 4,55–4,87:1 au survol destructive/20. Facultatif : `dark:hover:bg-destructive/20` dans `button.tsx:18` avec un repère de survol (`dark:hover:ring-1 dark:hover:ring-destructive/40`). Vérifier les bordures `aria-invalid:border-destructive`.
- **Verdict** : partiel. Non-conformité réelle, sévérité ramenée à faible ; `ai-summary.tsx:99` à retirer de la liste.

#### A11Y-16 — Vote actif en mode sombre : texte blanc sur accent-brand à 2,32:1

- **Sévérité** : faible · **Effort** : S · **Vérification** : confirmé
- **Emplacement** : `src/components/feedback/feedback-board.tsx:167`
- **Preuve** : `voted ? "bg-accent-brand text-white ring-accent-brand" : …`. En sombre, `--accent-brand` = oklch(0.74 0.12 262) = #81aaf7 : blanc dessus à 2,32:1 pour du texte de 14 px semi-gras (seuil 4,5:1) ; chevron sous 3:1. En clair : 7,02:1. `/retours` affichait 0 sujet lors de la mesure.
- **Impact** : dès qu'un visiteur vote en sombre (activé par défaut selon le système), le compteur devient peu lisible (WCAG 1.4.3).
- **Recommandation** : remplacer par `"bg-accent-brand text-accent-brand-foreground ring-accent-brand"` (8,47:1 en sombre, 6,63:1 en clair, même motif que `favorites-link.tsx:27`). Seule occurrence de ce couple dans `src/`.
- **Verdict** : confirmé, sévérité faible (défaut latent, état d'un seul bouton, aria-label correct).

#### A11Y-17 — Bordures des champs à 1,42:1 (clair) et 1,47:1 (sombre) : années, sélecteurs et zones de texte peu repérables

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/globals.css:76,115` ; `src/components/search-filters.tsx:121-142` ; `src/components/ui/input.tsx:11` ; `src/components/ui/textarea.tsx:9` ; `src/components/ui/select.tsx:43`
- **Preuve** : `--input` oklch(0.86 0.012 85) = #d4d0c8 : 1,42:1 sur le fond, 1,53:1 sur card ; en sombre, blanc à 15 % : 1,47:1. Sur `/search`, les 5 déclencheurs de Select et les 2 champs d'année ont un fond transparent ; pour les années, la bordure est le seul contour.
- **Impact** : champs d'année difficiles à repérer pour les personnes malvoyantes (WCAG 1.4.11). Les Select ont d'autres indices (valeur, chevron), la recherche principale aussi (icône, bouton).
- **Recommandation** : ne pas modifier `--input`, qui sert aussi de remplissage. Dans `globals.css`, `--color-input-border: var(--input-border);` dans `@theme inline`, `--input-border: oklch(0.63 0.012 85);` dans `:root` (~3,3:1) et `--input-border: oklch(1 0 0 / 38%);` dans `.dark` (~3,5:1). Remplacer `border-input` par `border-input-border` dans `input.tsx:11`, `textarea.tsx:9`, `select.tsx:43`. Si le rendu paraît lourd, limiter aux champs d'année (`className="border-input-border"`).
- **Verdict** : partiel. Mesures exactes ; seules les années n'ont aucun autre indice ; la recommandation initiale (foncer `--input`) avait des effets de bord.

#### A11Y-19 — Focus perdu quand l'élément actif disparaît, se désactive ou change de place

- **Sévérité** : faible · **Effort** : M · **Vérification** : partiel
- **Emplacement** : `src/components/ai-summary.tsx:63-102` ; `src/components/for-you.tsx:48-54,104` ; `src/components/recently-viewed.tsx:33-36` ; `src/components/highlights/highlight-item.tsx:58-62,88-111` ; `src/components/account/mcp-keys.tsx:90-92,127` ; `src/components/favorites/favorites-list.tsx:129-137,327-332` ; `src/components/feedback/feedback-board.tsx:40-45,164`
- **Preuve** : démontés au clic : « Condenser », carte « Pas intéressé », section « Effacer l'historique », citation supprimée, champ de note (Échap, Cmd+Entrée), clé révoquée, favori retiré sur `/favoris`. `disabled={i === 0}` après « Monter », `disabled={busy}` sur le vote focalisé. Mesure Chrome 152 : désactiver ou déplacer un bouton focalisé donne `activeElement = BODY`. « Descendre » déplace le nœud focalisé et perd le focus à chaque clic. Aucun `.focus(`, `tabIndex={-1}` ni `aria-disabled` dans `src/`.
- **Impact** : perte de l'indicateur de focus et de la position du lecteur d'écran (VoiceOver peut remonter en haut) ; Tab reprend toutefois juste après l'élément disparu. Cas le plus gênant : le condensé IA, qui n'est en plus pas annoncé (A11Y-13).
- **Recommandation** :
  - (S, priorité 1) `ai-summary.tsx` : zone `role="status" aria-live="polite"` montée en permanence ; bloc « done » avec `ref` et `tabIndex={-1}` focalisé à la fin ; en erreur, focus sur « Réessayer ».
  - (S, priorité 2) `feedback-board.tsx:164` : `aria-disabled={busy}` (le double clic est déjà ignoré l.51) ; figer l'ordre des sujets pendant l'interaction (recalcul seulement au changement de tri ou de filtre).
  - (S) `favorites-list.tsx:327-328` : `focusableWhenDisabled` sur les deux boutons (style `aria-disabled:opacity-50`), refocalisation du bouton concerné après `move()` via `useLayoutEffect` et `data-move`.
  - (S) Retrait d'un favori, suppression de citation, révocation de clé, « Pas intéressé », « Effacer l'historique » : focaliser l'élément suivant, sinon le précédent, sinon un repère stable (`tabIndex={-1}`).
  - (S) Note : `restoreFocusRef` levé seulement dans `cancelNote` et Cmd+Entrée, puis `noteButtonRef.current?.focus()`.
- **Verdict** : partiel. Emplacements exacts ; « repart du début du document » faux pour Tab ; renvoi à WCAG 3.2.x non fondé.

#### A11Y-21 — Formulaires : le placeholder sert seul de libellé visible, les contraintes ne sont pas indiquées, les boutons désactivés ne disent pas pourquoi

- **Sévérité** : faible · **Effort** : M · **Vérification** : partiel
- **Emplacement** : `src/components/feedback/feedback-board.tsx:216,259-279` ; `src/components/highlights/manual-citation-dialog.tsx:51-54` ; `src/components/collections/collection-dialog.tsx:55-75` ; `src/components/account/mcp-keys.tsx:142-147`
- **Preuve** : `const valid = title.trim().length >= 5` et `<Button type="submit" disabled={!valid || busy}>` : la règle des 5 caractères n'apparaît que dans le 400 du serveur, jamais atteint. Titre, description, passage, page, note, nom de liste et nom de clé n'ont qu'un `aria-label` et un placeholder ; « (facultatif) » n'est que dans le placeholder. Aucun `<label>` hors `search-filters.tsx:158`.
- **Impact** : qui tape « Bug » (3 caractères) est bloqué sans explication, le bouton désactivé sortant de l'ordre de tabulation (WCAG 3.3.2). Le reste relève de la bonne pratique (nom accessible présent, contexte donné par le titre de la boîte). `mcp-keys.tsx` n'a pas de contrainte (nom facultatif).
- **Recommandation** :
  1. `feedback-board.tsx:259-279` (vraie cible) : `useId()` pour `titleId`, `hintId`, `descId` ; `<label htmlFor={titleId}>Titre</label>`, `aria-required="true" aria-describedby={hintId}`, `<p id={hintId}>5 caractères minimum</p>` ; garder « Publier » actif (`disabled={busy}`) et, si `!valid`, `aria-invalid`, hint en `text-destructive` et focus sur le champ. Libellé visible « Description (facultatif) ».
  2. `manual-citation-dialog.tsx` : libellés visibles « Passage », « Page (facultatif) », « Note (facultatif) », `aria-required` sur le passage.
  3. `collection-dialog.tsx` : « Nom de la liste », « Description (facultatif) ».
  4. `mcp-keys.tsx` : libellé « Nom de la clé (facultatif) » ; `aria-describedby="keys-limit"` quand la limite est atteinte.
  5. Petit composant `Field` (label + champ + aide reliés par `useId`) ou `npx shadcn add label`.
- **Verdict** : partiel. Seule la règle cachée des 5 caractères a un impact réel.

#### A11Y-23 — Noms accessibles génériques et répétés sur les cartes (« Favori » ×20), et cœur placé avant le titre dans le DOM

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/components/favorites/favorite-button.tsx:67` ; `src/components/work-card.tsx:39-43,56` ; `src/components/collections/collection-picker.tsx:42-48` ; `src/components/favorites/favorites-list.tsx:324-341` ; `src/app/liste/[token]/page.tsx:60-69`
- **Preuve** : `aria-label="Favori"` fixe : 6 boutons identiques sur l'accueil, 20 par page de résultats. Dans le HTML, le cœur précède le `<h3>` du titre. « Ajouter à une liste » et « Monter / Descendre dans la liste » ne nomment pas l'article. Même ordre sur la page publique `/liste/[token]`.
- **Impact** : dans la liste des boutons d'un lecteur d'écran, N fois « Favori, bouton bascule » ; au clavier, on entend « Favori » avant le titre. Gêne d'usage, pas une non-conformité AA nette.
- **Recommandation** :
  1. `favorite-button.tsx:67` : `` aria-label={`Favori : ${truncateWords(snapshot.title, 12)}`} `` (état porté par `aria-pressed`).
  2. `collection-picker.tsx:48` (variante icône) : `` aria-label={`${label} : ${snapshot.title}`} ``.
  3. `favorites-list.tsx:327-328` : `Monter « ${f.title} » dans la liste` / `Descendre …`.
  4. Déplacer le bloc `absolute right-3 top-3 z-10` juste après le titre dans `work-card.tsx`, `favorites-list.tsx` et `liste/[token]/page.tsx` (même rendu grâce au positionnement absolu et aux marges `pr-*` existantes).
- **Verdict** : partiel. Faits confirmés, page `/liste` oubliée à l'origine ; sévérité faible.

#### A11Y-24 — Révocation d'une clé MCP en un clic, sans confirmation ni annulation

- **Sévérité** : faible · **Effort** : S · **Vérification** : confirmé
- **Emplacement** : `src/components/account/mcp-keys.tsx:90-101,127` ; `src/lib/api-keys.ts:43-52`
- **Preuve** : `onClick={() => void revoke(k)}` retire la clé de la liste (l.92) puis envoie `DELETE /api/account/keys/${k.id}` (l.94) ; le toast « Clé révoquée. » ne propose rien. `revokeKey` supprime le document (seul le hachage est stocké : annulation impossible). Les autres suppressions passent par une confirmation ou un « Annuler ». Le `<li>` démonté renvoie le focus sur `<body>`.
- **Impact** : un appui involontaire (tremblement, commande vocale) coupe l'accès de l'assistant ; il faut recréer une clé et reconfigurer le connecteur (WCAG 3.3.4). Rattrapable en deux minutes.
- **Recommandation** : état `const [revoking, setRevoking] = useState<ApiKeyInfo | null>(null);`, `onClick={() => setRevoking(k)}` (l.127), puis un `<Dialog>` sur le modèle de `favorites-list.tsx:212-233` : titre « Révoquer « {revoking?.name} » ? », description (« L'assistant qui utilise cette clé perdra immédiatement l'accès… »), « Annuler » et un bouton `destructive` qui appelle `revoke`. Focus de repli via `finalFocus={inputRef}` sur `DialogContent` (champ « Nom de la clé »). Pas d'annulation par toast (exigerait une suppression logique).
- **Verdict** : confirmé ; sévérité ramenée à faible (conséquence rattrapable).

#### A11Y-25 — Bouton « Précédent » inactif : contraste de 3,47:1 et état désactivé non exposé

- **Sévérité** : faible · **Effort** : S · **Vérification** : confirmé
- **Emplacement** : `src/components/pagination.tsx:21-23,37`
- **Preuve** : axe `color-contrast` (serious) sur `/search?q=télétravail` et `/theme/informatique` en clair : `<span class="… pointer-events-none opacity-50">`, #838486 sur #f9f6f1 = 3,47:1 pour 14 px. Span sans `aria-disabled`, donc l'exemption des composants inactifs ne s'applique pas. En sombre : ~5:1.
- **Impact** : « Précédent » peu lisible en page 1 et non annoncé comme inactif (la position « Page 1 sur N » compense en partie). Même problème pour « Suivant » en dernière page.
- **Recommandation** : l.23, `<span role="link" aria-disabled="true" className={cn(buttonVariants({ variant: "outline" }), "pointer-events-none text-muted-foreground")}>{icon}{label}</span>` (5,58:1 en clair, 7,63:1 en sombre ; `role="link"` nécessaire pour qu'`aria-disabled` soit pris en compte). Autre option : `aria-hidden="true"` et `invisible` pour garder la place. Relancer axe avant d'annoncer un gain Lighthouse.
- **Verdict** : confirmé ; gain de 4 à 5 points plausible mais non vérifié.

#### A11Y-26 — Libellé visible absent du nom accessible : « Gérer », « Copier avec la référence », entrée « Mon compte » du menu

- **Sévérité** : faible · **Effort** : S · **Vérification** : confirmé
- **Emplacement** : `src/components/favorites/favorites-list.tsx:269` ; `src/components/highlights/highlight-item.tsx:42,105,110` ; `src/components/auth/auth-button.tsx:76,89`
- **Preuve** : le bouton affiche « Gérer » mais s'appelle « Renommer ou supprimer la liste » (le menu propose aussi Partager). « Copier avec la référence » s'appelle « Copier le passage « … » avec sa référence ». L'entrée qui affiche nom et e-mail porte `aria-label="Mon compte"`, doublon de l'entrée l.89. Après un clic, « Copié » est masqué par l'`aria-label` fixe et aucun toast n'annonce le succès.
- **Impact** : « cliquer Gérer » ou « cliquer Lucas » échoue en commande vocale (WCAG 2.5.3, technique d'échec F96) ; le lecteur d'écran lit deux fois « Mon compte ».
- **Recommandation** :
  1. `favorites-list.tsx:269` : `` aria-label={`Gérer la liste ${collection.name}`} ``.
  2. `highlight-item.tsx:110` : `` aria-label={copied ? "Copié" : `Copier avec la référence : « ${h.text.slice(0, 40)}… »`} `` et `toast.success("Passage copié avec sa référence")` dans `copy()` (l.42). Même principe l.105 (voir A11Y-06).
  3. `auth-button.tsx:76` : supprimer `aria-label="Mon compte"` (le nom devient nom + e-mail), ou retirer l'entrée redondante l.89.
- **Verdict** : confirmé ; sévérité faible.

#### A11Y-27 — Champ de recherche de l'accueil en autofocus : l'en-tête et l'introduction sont sautés

- **Sévérité** : faible · **Effort** : S · **Vérification** : confirmé
- **Emplacement** : `src/app/page.tsx:24` ; `src/components/search-box.tsx:20,32,135`
- **Preuve** : `<SearchBox size="hero" … autoFocus />`. Au chargement de `/`, `activeElement` est l'input `role="combobox"` ; logo, « Recherche », thème et « Se connecter » ne sont atteignables qu'en Maj+Tab, et le lecteur d'écran démarre dans le champ sans avoir entendu le h1. Après la fenêtre d'accueil, le focus revient aussi au champ.
- **Impact** : orientation dégradée à l'arrivée ; motif courant (moteurs de recherche), pas un échec WCAG formel.
- **Recommandation** : retirer `autoFocus` de `page.tsx:24` ; la prop de `SearchBox` n'a plus d'appelant. Ajouter le lien d'évitement d'A11Y-11 pour que le champ soit le premier élément focalisable de `main`.
- **Verdict** : confirmé ; sévérité faible.

#### A11Y-28 — Annonce MCP : dialogue modal qui s'ouvre seul 0,9 s après l'arrivée et prend le focus

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/components/mcp-announcement.tsx:22-28` ; `src/components/mcp-announcement-content.tsx:37`
- **Preuve** : `setTimeout(() => setOpen(true), 900)` ouvre un `Dialog` Base UI (modal par défaut) qui place le focus sur « Plus tard », même si l'utilisateur tape dans la recherche (`autoFocus` sur l'accueil).
- **Impact** : frappe interrompue une fois par navigateur ; focus du lecteur d'écran déplacé sans action. Références exactes : WCAG 2.2.4 et 3.2.5 (AAA), pas de non-conformité A/AA. Base UI rend le focus au champ à la fermeture.
- **Recommandation** : avant `setOpen(true)`, vérifier que `document.activeElement` n'est ni `HTMLInputElement`, ni `HTMLTextAreaElement`, ni `isContentEditable` ; annuler le minuteur au premier `keydown`, `input` ou `pointerdown` (`{ once: true, capture: true }`), sans poser la clé (nouvel essai à la visite suivante). Autre option : carte non modale (`<Dialog open modal={false}>`, `initialFocus={false}`).
- **Verdict** : partiel. Mécanisme réel, ponctuel ; référence WCAG corrigée.

#### A11Y-29 — Plein écran de repli du lecteur PDF sans confinement : la page derrière reste focalisable

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/components/highlights/pdf-reader.tsx:51-58,80-81`
- **Preuve** : sans API Fullscreen (iPhone), le lecteur passe en `fixed inset-0 z-50`, mais l'en-tête (`sticky z-40`), le pied de page et la barre « Fiche article / PDF original » ne reçoivent pas `inert` (aucune occurrence d'`inert` dans `src/`).
- **Impact** : Tab ou le balayage VoiceOver peuvent mener à des liens cachés sous le lecteur. Échap ferme le calque ; critère plus proche de 2.4.3 que de 2.4.11.
- **Recommandation** : effet dans `ReaderLayout` dépendant de `fallback` : poser `inert` sur `body > header`, `body > footer` et les frères du conteneur, puis le retirer au nettoyage. **Ne pas** poser `inert` sur tous les enfants de `body` (le Toaster et son bouton « Annuler » deviendraient inutilisables). Facultatif : `overflow: hidden` sur `html` pendant le repli. Tester en émulation iPhone.
- **Verdict** : partiel. Fait exact, périmètre étroit, recommandation initiale corrigée.

#### A11Y-30 — Rôles ARIA incomplets : radiogroup sans flèches, aria-pressed doublé d'un libellé qui change

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/components/feedback/feedback-board.tsx:98,162-163,238-257` ; `src/components/highlights/pdf-reader.tsx:95-96` ; `src/components/favorites/favorites-list.tsx:379`
- **Preuve** : `role="radiogroup"` contenant deux `<button role="radio" aria-checked>` sans gestion des flèches ni tabindex itinérant (deux arrêts de tabulation). Plein écran : `aria-pressed={full}` et un libellé qui passe à « Quitter le plein écran », d'où « Quitter le plein écran, bouton bascule, enfoncé ». Même défaut sur le vote (`aria-pressed={voted}` + « Voter » / « Retirer mon vote »), non relevé à l'origine.
- **Impact** : comportement clavier différent de ce qu'annonce le lecteur d'écran ; états annoncés deux fois. Pas d'échec WCAG (rôle et état exposés, commandes utilisables au clavier).
- **Recommandation** :
  1. `pdf-reader.tsx:95` : supprimer `aria-pressed={full}`.
  2. `feedback-board.tsx:162` : supprimer `aria-pressed={voted}`, ou garder `aria-pressed` avec un libellé fixe `Voter : ${item.title} (${n} votes)`.
  3. `feedback-board.tsx:238-257` : `RadioGroup` de `@base-ui/react/radio-group` et `Radio.Root value="bug"|"idea"`, styles sur `data-[checked]` ; ou `<fieldset>` avec `<legend className="sr-only">Type de sujet</legend>` et deux `<input type="radio" className="peer sr-only">`.
  4. Puces à sélection unique : aucun changement obligatoire (`ToggleGroup` en option).
- **Verdict** : partiel. Faits exacts ; les puces en `role="group"` avec `aria-pressed` sont un modèle admis.

#### A11Y-31 — Passages surlignés distingués par la seule couleur, et rien en mode de couleurs forcées

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/globals.css:231-240,266,320-324`
- **Preuve** : `mark[data-highlight] { background: color-mix(in oklch, var(--highlight) var(--highlight-alpha), transparent) }` (55 % en clair, 30 % en sombre), sans autre indice. Écart de luminance avec le fond : 1,11:1 sur le fond et 1,16:1 sur une carte en clair ; 1,83–1,91:1 en sombre. Vérification : en `forced-colors` émulé, Chromium rend `rgba(255,255,0,0.55)` (le surlignage reste visible), et `.textLayer` garde son jaune (`forced-color-adjust: none`). Deutéranopie et protanopie : jaune distinct ; tritanopie : rose pâle peu visible.
- **Impact** : repérage difficile pour la tritanopie, la basse vision, les écrans monochromes et l'impression (WCAG 1.4.1). La liste « Mes surlignages » et les repères sr-only donnent déjà l'information en texte.
- **Recommandation** : ajouter dans `mark[data-highlight]` (l.231-237) `box-shadow: inset 0 -2px 0 var(--highlight-foreground);` (3,35–3,73:1 en clair, 12,9:1 en sombre ; suit les retours à la ligne grâce à `box-decoration-break: clone`) ; en option le même trait sur `.hl-text` (l.240) ; pour `.textLayer .hl` (l.320-324), `box-shadow: inset 0 -2px 0 oklch(0.6 0.13 80);`. Le bloc `@media (forced-colors: active)` n'est utile que pour Firefox (non vérifié).
- **Verdict** : partiel. Le volet « rien en couleurs forcées » est faux dans Chromium ; les daltonismes courants voient le jaune.

#### A11Y-32 — prefers-reduced-motion ignoré par les primitives et plusieurs animations

- **Sévérité** : faible · **Effort** : S · **Vérification** : confirmé
- **Emplacement** : `src/components/ui/dialog.tsx:34,56` ; `src/components/ui/select.tsx:85` ; `src/components/ui/dropdown-menu.tsx:43,137` ; `src/components/ui/tooltip.tsx:52` ; `src/components/highlights/selection-button.tsx:21` ; `src/components/ai-summary.tsx:108` ; `src/components/work-card.tsx:35` ; `src/components/highlights/pdf-reader.tsx:247`
- **Preuve** : `data-open:animate-in … zoom-in-95` sans variante `motion-reduce` dans dialog, select, dropdown-menu, tooltip et selection-button ; points `animate-bounce` en boucle pendant la synthèse ; `hover:-translate-y-0.5` sur les cartes (aussi theme-grid.tsx:14, recently-viewed.tsx:46, liste/[token]/page.tsx:59, favorites-list.tsx:323) ; `scrollIntoView({ behavior: "smooth" })` pour sauter de page dans le PDF. tw-animate-css 1.4.0 n'a aucun repli ; `globals.css` ne traite que `.shimmer`. Une quinzaine d'animations du site respectent déjà `motion-reduce:animate-none`.
- **Impact** : gêne réelle mais faible pour les personnes sensibles au mouvement ; le cas le plus gênant est le défilement fluide sur de nombreuses pages du PDF.
- **Recommandation** :
  1. `motion-reduce:animate-none` sur dialog.tsx:34 et :56, select.tsx:85, dropdown-menu.tsx:43 et :137, tooltip.tsx:52, selection-button.tsx:21.
  2. `ai-summary.tsx:108` : `motion-safe:animate-bounce` ; garder le `Loader2 animate-spin`.
  3. `motion-safe:hover:-translate-y-0.5` sur les 5 cartes citées.
  4. `pdf-reader.tsx:247` : `behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"` (une règle CSS ne suffit pas pour une option JavaScript).
- **Verdict** : confirmé ; relevé incomplet à l'origine sur le soulèvement des cartes.

#### A11Y-34 — « Lire la suite » et « Lire le passage en entier » inutiles au lecteur d'écran, et aria-expanded sans aria-controls

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/components/feedback/feedback-board.tsx:184-188` ; `src/components/highlights/highlight-item.tsx:75-82`
- **Preuve** : ces boutons ne font que basculer un `line-clamp` CSS : le texte entier est déjà dans l'arbre d'accessibilité, puis le lecteur d'écran tombe sur « Lire la suite, bouton, réduit ». Pas d'`aria-controls`, contrairement à `pdf-reader.tsx:84`.
- **Impact** : un arrêt de tabulation en trop et un état légèrement trompeur ; aucune information perdue. Pas une non-conformité WCAG.
- **Recommandation** (facultatif, fin de liste) : `useId()` + `id` sur le texte (feedback-board.tsx:184, highlight-item.tsx:75) et `aria-controls` sur le bouton. Garder `aria-expanded`. **Ne pas** mettre `aria-hidden` ni `tabIndex={-1}` : le bouton est utile aux utilisateurs voyants au clavier ou avec loupe.
- **Verdict** : partiel. Constat de base exact, impact cosmétique, première correction proposée à l'origine régressive.

#### A11Y-35 — Liens externes qui ouvrent un nouvel onglet sans le signaler

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/components/author-chip.tsx:103,128,133` ; `share-dialog.tsx:63` ; `src/components/highlights/read-pdf-button.tsx:33` ; `site-footer.tsx:26` ; `src/components/highlights/pdf-reader.tsx:320` ; et dans `src/app` : `article/[id]/page.tsx:137,147,152,157,176`, `article/[id]/lire/page.tsx:43`, `confidentialite/page.tsx:132`, `a-propos/page.tsx:28,42`, `mentions-legales/page.tsx:36,48,56`, `conditions/page.tsx:43`
- **Preuve** : 9 liens `target="_blank"` dans `src/components`, dont 7 sans mention ; la vérification en ajoute 14 dans `src/app`, soit 21 sur 23 (seuls `pdf-reader.tsx:288,294` le disent dans le texte). `ExternalLinkIcon` est `aria-hidden`.
- **Impact** : le lecteur d'écran change d'onglet sans prévenir et le bouton Retour ne fonctionne plus (technique G201, critère 3.2.5 AAA).
- **Recommandation** : composant `src/components/external-link.tsx` : `export function ExternalLink({ children, ...props }: React.ComponentProps<"a">) { return <a target="_blank" rel="noopener noreferrer" {...props}>{children}<span className="sr-only"> (nouvel onglet)</span></a>; }` (texte en fin, compatible 2.5.3), utilisé pour les 21 liens. Plus simple pour les pages légales et « Données OpenAlex » du pied de page : retirer `target="_blank"`. Garder le nouvel onglet pour le partage, les PDF et les pages d'éditeur.
- **Verdict** : partiel. Exact pour `src/components`, deux tiers des liens (dont les boutons de la fiche) oubliés à l'origine.

#### A11Y-36 — Le titre de la page 404 est identique à celui de l'accueil

- **Sévérité** : faible · **Effort** : S · **Vérification** : confirmé
- **Emplacement** : `src/app/not-found.tsx:1-12` ; `src/app/layout.tsx:13`
- **Preuve** : `not-found.tsx` n'exporte pas de `metadata`. En production, `/page-inexistante-audit`, `/theme/zzz-inexistant` et `/liste/zzzinexistant` répondent 404 avec `<title>Sextant — la littérature scientifique, sans détour</title>`. La branche « Liste introuvable » de `liste/[token]/page.tsx:27` ne sert donc jamais.
- **Impact** : l'onglet, l'historique et l'annonce du titre ne signalent pas l'erreur (WCAG 2.4.2) ; le h1 « Page introuvable » reste lu.
- **Recommandation** : en tête de `src/app/not-found.tsx` : `import type { Metadata } from "next"; export const metadata: Metadata = { title: "Page introuvable" };` (rendu « Page introuvable · Sextant », pris en compte par Next 16.3.6 via `resolve-metadata.js:438-444`). Pas besoin de `robots` (noindex déjà injecté). Vérifier avec `curl -s https://sextant-psi.vercel.app/page-inexistante-audit | grep -o '<title>[^<]*</title>'`.
- **Verdict** : confirmé ; en navigation client, le titre change mais passe au titre de l'accueil.

#### A11Y-37 — Page thème : fil d'Ariane sans nav, liens repérables par la seule couleur, sujet actif sans état exposé

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/theme/[slug]/page.tsx:46-51,59-65` ; `src/app/article/[id]/page.tsx:104-108`
- **Preuve** : fil d'Ariane dans un `div`, lien « Thématiques » non souligné, séparateur `<span>/</span>` lu « barre oblique ». Sujet actif distingué seulement par `variant={active ? "default" : "secondary"}`, sans `aria-current` ni texte, alors qu'activer ce lien retire le filtre (href `/theme/${slug}`). `Results` n'affiche nulle part le sujet actif.
- **Impact** : le lecteur d'écran n'indique pas quel sujet filtre la liste (1.3.1 / 4.1.2). Le volet « couleur seule » (1.4.1) ne tient pas : inversion de luminance marquée ; fil d'Ariane et lien de la fiche relèvent de la bonne pratique.
- **Recommandation** :
  1. Priorité : sur le `<Link>` du sujet, `aria-current={active ? "true" : undefined}` et dans le badge `{active && <span className="sr-only"> (filtre actif, activer pour le retirer)</span>}` ; liste enveloppée dans `<nav aria-label="Sujets">` ou `role="group" aria-label="Filtrer par sujet"`.
  2. Fil d'Ariane : `<nav aria-label="Fil d'Ariane"><ol>…<li aria-hidden>/</li>…<span aria-current="page">{theme.name}</span></ol></nav>`, lien souligné.
  3. Facultatif : `underline underline-offset-2` sur le lien de thème de la fiche.
- **Verdict** : partiel. Un défaut réel (état non exposé) ; deux points présentés à tort comme des échecs WCAG.

#### A11Y-38 — Tailles de texte fixées en px : 55 occurrences, dont des textes de 10 à 11 px

- **Sévérité** : faible · **Effort** : S · **Vérification** : confirmé
- **Emplacement** : 29 fichiers, par exemple `src/components/author-chip.tsx:129,147`, `src/components/favorites/favorites-link.tsx:27`
- **Preuve** : `grep -oE 'text-\[[0-9.]+px\]'` : 47 `text-[15px]`, 3 `text-[17px]`, une chacune de `[14px]`, `[13px]`, `[11px]`, `[10px]`, `[8px]`. Le reste est en rem.
- **Impact** : ces textes ignorent la taille de police par défaut choisie dans le navigateur (avec 20 px par défaut, `text-sm` passe à 17,5 px mais `text-[15px]` reste à 15 px) ; hiérarchie inversée. La pastille de compteur garde 10 px dans un conteneur en rem qui grandit. WCAG 1.4.4 respecté grâce au zoom.
- **Recommandation** : dans `@theme inline` de `globals.css`, `--text-body: 0.9375rem;` et `--text-lead: 1.0625rem;` ; remplacer les 47 `text-[15px]` par `text-body`, les 3 `text-[17px]` par `text-lead`, `text-[14px]` par `text-sm` (mcp-announcement-content.tsx:58), `text-[13px]` par `text-[0.8125rem]` (mcp-keys.tsx:49), `text-[11px]` par `text-xs` (author-chip.tsx:147), `text-[10px]` par `text-[0.625rem]` (favorites-link.tsx:27). Le `text-[8px]` du logo ORCID (décoratif) est facultatif. Vérifier avec le grep et la taille de police « Très grande » de Chrome.
- **Verdict** : confirmé ; sévérité faible.

#### A11Y-39 — Bouton de thème : nom et icône faux en mode sombre jusqu'à l'hydratation

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/components/theme-toggle.tsx:3,15-20,31-38`
- **Preuve** : `useState<Theme | null>(null)` puis `useEffect(() => setTheme(current()), [])` : le serveur rend toujours `MoonIcon` et « Passer en mode sombre », même quand THEME_SCRIPT a déjà posé la classe `dark` (vérifié par GET en local et en production).
- **Impact** : l'icône passe de la lune au soleil à chaque chargement en sombre, dans l'en-tête de toutes les pages. Le libellé faux ne dure que jusqu'à l'hydratation, avant toute interaction réaliste.
- **Recommandation** : supprimer l'état et l'effet ; rendre `<MoonIcon className="dark:hidden" aria-hidden /><SunIcon className="hidden dark:block" aria-hidden />` (la variante `dark` de `globals.css:5` suit la classe posée avant l'affichage) ; nom stable `aria-label="Basculer entre thème clair et sombre"`. Pas d'`aria-pressed` rendu côté serveur.
- **Verdict** : partiel. Constat exact, cadrage accessibilité exagéré (défaut surtout visuel).

#### A11Y-40 — Bouton de thème : impossible de revenir au thème du système après un premier choix

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/components/theme-toggle.tsx:22-32` ; `src/app/layout.tsx:19`
- **Preuve** : chaque clic fait `localStorage.setItem("theme", next)` ; aucun `removeItem("theme")` dans `src/`. Le script de `layout.tsx:19` ne consulte plus le système dès qu'une valeur existe.
- **Impact** : l'utilisateur ne suit plus la préférence de son système au prochain chargement sans vider les données du site. Pas d'effet sur le contraste (le site ne lit pas `prefers-contrast`) ; pas de bascule en cours de session, même aujourd'hui.
- **Recommandation** : remplacer le bouton par un menu (`src/components/ui/dropdown-menu.tsx`) Clair / Sombre / Système, déclencheur `aria-label="Thème : <actuel>"` ; « Système » fait `localStorage.removeItem("theme")` (try/catch) et applique `matchMedia("(prefers-color-scheme: dark)").matches` ; tant qu'aucune préférence n'est enregistrée, écouter `matchMedia(...).addEventListener("change", …)`. Plus petit : cycle Clair → Sombre → Système sur le bouton actuel, icône Monitor et libellé « Suivre le système ».
- **Verdict** : partiel. Fond exact, impact mal qualifié (préférence d'interface).

#### NEW-12 — Champs de note en 14–15 px sur mobile : iOS Safari zoome la page à la saisie et ne revient pas

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/components/notes/article-note.tsx:106` ; `src/components/highlights/highlight-item.tsx:89-102` ; `src/components/collections/collection-dialog.tsx:74` ; `src/components/feedback/feedback-board.tsx:275` ; `src/components/collections/share-dialog.tsx:59`
- **Preuve** : les primitives mettent `text-base md:text-sm` (16 px sur mobile) pour éviter ce zoom (`ui/input.tsx:11`, `ui/textarea.tsx:9`) ; `cn` supprime ce `text-base` quand un composant passe sa taille : « Ma note » `text-[15px] … md:text-[15px]`, note de surlignage `text-sm md:text-sm` (avec `autoFocus`), description de liste `text-sm md:text-sm`, description sur `/retours` `text-[15px] md:text-[15px]`. Viewport sans `maximum-scale`. Le champ de partage est en lecture seule (zoom non démontré).
- **Impact** : sur iPhone, zoom automatique au focus d'un champ sous 16 px ; la page reste agrandie après la saisie (on peut la remettre à l'échelle en pinçant).
- **Recommandation** : `text-base md:text-[15px]` dans `article-note.tsx:106` et `feedback-board.tsx:275` ; `text-base md:text-sm` dans `highlight-item.tsx:102` et `collection-dialog.tsx:74` ; facultatif pour `share-dialog.tsx:59`. Ne pas utiliser `maximum-scale=1` ni `user-scalable=no` (recul WCAG 1.4.4). Règle de revue : tout `md:text-*` sur un `<Input>` ou `<Textarea>` précédé de `text-base`.
- **Verdict** : partiel. Liste incomplète à l'origine (2 champs ajoutés), un champ cité douteux ; sévérité faible.

### 4.4 Qualité

#### QUAL-01 — Le filtre « Toutes les sources » ne fait rien : la valeur « all » a deux sens

- **Sévérité** : moyenne · **Effort** : S · **Vérification** : confirmé
- **Emplacement** : `src/components/search-filters.tsx:61,93` ; `src/components/results.tsx:35` ; `src/lib/openalex.ts:162,228`
- **Preuve** : `onValueChange={(v) => update({ src: v === "any" ? "all" : null })}`, mais `update` supprime tout paramètre qui vaut `"all"` (l.61) ; le serveur calcule `coreOnly: first(sp.src) !== "all"`. L'interface ne peut jamais produire `src=all` et le Select revient sur « Revues indexées uniquement ». Mesure : `/search?q=microbiome` 407 005 résultats, `&src=all` 517 991 (+27 %) ; `/search?q=microplastics` 71 525 contre 101 455. Même bug sur `/theme/[slug]`.
- **Impact** : une option visible n'a aucun effet et ~30 % du corpus est inaccessible par l'interface. Contrat d'URL défini à trois endroits sans source unique.
- **Recommandation** :
  1. `search-filters.tsx:93` : `value={params.get("src") === "any" ? "any" : "all"}` et `onValueChange={(v) => update({ src: String(v) })}` (`"all"` retiré par `update`, `"any"` écrit dans l'URL).
  2. `results.tsx:35` : `coreOnly: first(sp.src) !== "any"`. Aucune URL existante ne contient `src=all`.
  3. Vérifier : « Toutes les sources vérifiées » ajoute `src=any`, le compteur augmente, « Réinitialiser » retire `src`, idem sur `/theme`.
  4. Plus tard (M, optionnel) : `src/lib/search-params.ts` partagé (listes blanches des options, en même temps que SEC-15).
- **Verdict** : confirmé par deux vérifications ; sévérité ramenée de élevée à moyenne (filtre secondaire, pas de perte de données).

#### QUAL-02 — Deux implémentations divergentes de l'APA et du BibTeX : un même article est cité différemment selon l'écran (et import circulaire)

- **Sévérité** : moyenne · **Effort** : M · **Vérification** : partiel
- **Emplacement** : `src/lib/format.ts:2,134-183` ; `src/lib/favorites-shared.ts:38,74-163` ; `src/app/article/[id]/page.tsx:161-162` ; `src/lib/mcp-tools.ts:112,195` ; `src/components/favorites/favorites-list.tsx:141,149`
- **Preuve** : la fiche et `get_article` utilisent `toApa`/`toBibtex(work)` ; favoris, exports, listes, citations et `get_list` utilisent `apaFromSnapshot`/`bibtexFromSnapshot`/`bibtexAll`, chacun avec sa `bibKey`. Exécution sur copies : « Jean-Pierre van der Berg » → « Berg, J. V. D. » (fiche) contre « van der Berg, J.-P. » (favoris) ; clés `beethoven2021deep` / `vanbeethoven2021deep` ; « Jean-Pierre Dupont » → `Dupont, J.` contre `Dupont, J.-P.`. Thèse : `@article` contre `@phdthesis` ; conference-paper : `@inproceedings` contre `@article`. Volume, numéro et pages seulement sur la fiche. Cycle madge `format.ts ↔ favorites-shared.ts` (sans effet à l'exécution). OpenAlex compte 16,2 M conference-papers et 11,3 M thèses.
- **Impact** : deux références APA différentes pour un même article, dont une avec un nom de famille faux, et des doublons dans le `.bib`. Toute correction à faire deux fois. Aussi relevé : `snapshotFromWork` tronque à 50 auteurs (dernier auteur faux en APA au-delà), `toBibtex` écrit `journal` pour un livre et `author = {}` sans auteur, les clés suppriment les lettres accentuées.
- **Recommandation** (Vitest en devDependency, voir QUAL-19) :
  1. `src/lib/citation.ts` sans dépendance vers `format.ts`, qui reçoit `bibField`, `PARTICLES`, `splitAuthorName`, `bibKey`, `formatBibtex`, `formatApa`, `citeInline`, `bibtexAll`, sur un type unique `CitationSource = FavoriteSnapshot & { biblio?: { volume?; issue?; firstPage?; lastPage? } }` ; réexports temporaires dans `favorites-shared.ts`.
  2. Supprimer de `format.ts` la l.2 et les l.134-183 (fin du cycle).
  3. Fiche et `get_article` : `formatApa(citationFromWork(work))`, avec `citationFromWork(w) = { ...snapshotFromWork(w), biblio: { volume: w.biblio?.volume, issue: w.biblio?.issue, firstPage: w.biblio?.first_page, lastPage: w.biblio?.last_page } }`.
  4. Types BibTeX : book → `@book`/`publisher`, dissertation → `@phdthesis`/`school`, conference-paper → `@inproceedings`/`booktitle`, autres → `@article`/`journal` ; volume, number, pages si `biblio` ; pas d'`author` vide.
  5. APA : « , vol(num), p1–p2 » si `biblio` ; `biblio` ajouté à l'instantané et accepté par `sanitizeSnapshot` (chaînes ≤ 20 caractères, facultatif).
  6. `snapshotFromWork` : `names.length > 50 ? [...names.slice(0, 49), names.at(-1)] : names`.
  7. `bibKey` : `.normalize("NFD").replace(/[\u0300-\u036f]/g, "")` avant le filtre `[^A-Za-z0-9]` (voir QUAL-08).
  8. ~10 tests dans `src/lib/citation.test.ts` (particules, prénoms composés, accents, 0/2/21/+50 auteurs, types, `biblio`, clés dédoublonnées).
- **Verdict** : partiel (deux vérifications) : faits reproduits, sévérité ramenée de élevée à moyenne.

#### QUAL-03 — Aucune frontière d'erreur : un 429 ou un 5xx d'OpenAlex sur la fiche ou le lecteur affiche la page d'erreur de Next en anglais, sans lang ni navigation

- **Sévérité** : moyenne · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/` (ni `error.tsx` ni `global-error.tsx`) ; `src/app/article/[id]/page.tsx:52-53,62` ; `src/app/article/[id]/lire/page.tsx:18-19,27` ; `src/lib/openalex.ts:199-206,253-260`
- **Preuve** : `src/app` ne contient que `not-found.tsx`, `template.tsx` et `article/[id]/loading.tsx`. `getWork` relance toute erreur autre que 404 ; la fiche et le lecteur l'appellent sans catch (`generateMetadata` l'entoure de `.catch(() => null)`, d'où un onglet « Article introuvable » trompeur). En production, `/article/W99999999999999999999999` renvoie 200 en 10,7 s avec un digest d'erreur ; rendu Chrome : `<html id="__next_error__">` sans `lang`, « This page couldn't load / A server error occurred. Reload to try again. », sans en-tête ni lien. Même écran avec `sextant:recent = [null]` (QUAL-09).
- **Impact** : lors d'un incident OpenAlex (429/5xx persistant sur une notice hors cache), la fiche et le lecteur deviennent une page en anglais sans langue déclarée (WCAG 3.1.1) ni navigation du site. Le bouton Reload et le retour navigateur restent disponibles. Toute exception future d'un composant produira le même écran.
- **Recommandation** :
  1. `src/app/error.tsx` (`"use client"`, props `{ error, retry }`) : bloc `role="alert"` « Cette page n'a pas pu se charger », « Notre source de données (OpenAlex) ne répond pas pour le moment. Réessayez dans un instant. », `<Button onClick={retry}>Réessayer</Button>` (pas `reset` seul, qui ne redemande pas les données) et `<Link href="/">Retour à l'accueil</Link>`.
  2. `src/app/global-error.tsx` : `<html lang="fr"><body>` avec le même message, `import "./globals.css"`.
  3. Fiche et lecteur : try/catch autour de `getWork(id)` ; sur `OpenAlexError`, `<EmptyState>` (« OpenAlex est très sollicité en ce moment. » si `e.isRateLimited`) avec `retryHref` ; relancer toute autre erreur.
  4. `generateMetadata` : « Article introuvable » seulement sur un vrai 404 ; délai maximal sur `fetch` (PERF-07).
- **Verdict** : partiel (deux vérifications) : mécanisme reproduit en production ; « sans retour possible » exagéré ; sévérité ramenée à moyenne ; `retry` et non `reset`.

#### QUAL-04 — Erreurs serveur avalées sans trace, et pannes présentées comme des états normaux (déconnecté, 0 favori, lien introuvable)

- **Sévérité** : moyenne · **Effort** : M · **Vérification** : partiel
- **Emplacement** : `src/app/api/**` ; `src/lib/auth.ts:38-40` ; `src/app/api/auth/session/route.ts:52-62` ; `src/app/liste/[token]/page.tsx:21` ; `src/app/compte/page.tsx:36-39` ; `src/app/api/mcp/route.ts:29` ; `src/app/api/auth/account/route.ts:30` ; `src/app/api/summary/route.ts:41` ; pas d'`instrumentation.ts`
- **Preuve** : aucun `console.error` côté serveur (seulement deux côté client dans `pdf-reader.tsx`), pour ~90 `catch` dans `src/app` et `src/lib` (73 nus) et 29 réponses 500/502 sans cause. `getCurrentUser` fait `catch { return null }` : une panne du SDK Admin équivaut à une déconnexion. `/api/auth/session` répond « Jeton invalide. » (401) à toute panne et avale les écritures de profil. `getSharedList(token).catch(() => null)` fait afficher « Page introuvable » quand Firestore est en panne ; `countFavorites(uid).catch(() => 0)` affiche « 0 favori » ; `verifyKey(key).catch(() => null)` fait croire au connecteur MCP que la clé est invalide. Historique : commit 067d62d (« 500 sur toutes les pages ») puis 4e838b4 (ajout de `/api/health` pour diagnostiquer à l'aveugle).
- **Impact** : la cause des erreurs attrapées n'apparaît jamais dans les journaux Vercel (les exceptions non attrapées, elles, sont journalisées par Next) ; des états faux (0 favori, lien « introuvable », déconnexion) s'affichent pendant les pannes ; une suppression de compte partielle ne laisse aucune trace.
- **Recommandation** :
  1. `src/lib/log.ts` (`import "server-only"`) : `logError(scope, err, ctx?)` qui écrit `console.error(JSON.stringify({ level: "error", scope, name, message: message.slice(0, 300), code, status, ...ctx }))`, jamais de corps, jeton, clé ni cookie.
  2. `auth.ts:38` : journaliser sauf pour les codes attendus (`auth/session-cookie-expired`, `-revoked`, `argument-error`, `user-disabled`, `user-not-found`) ; garder `return null`.
  3. `session/route.ts` : `.catch((e) => logError("session.profile", e))` (l.52, 56) ; l.61, garder 401 pour les erreurs de jeton, sinon `logError` et 503 « Connexion momentanément impossible, réessayez. ».
  4. `liste/[token]/page.tsx:21` : supprimer le `.catch(() => null)` (null reste renvoyé pour un jeton inconnu) et ajouter `error.tsx` (QUAL-03).
  5. `compte/page.tsx:36-39` : `logError` et `null`, affiché « — ».
  6. `mcp/route.ts:29` : journaliser (voir NEW-7 pour le code de réponse).
  7. Les 29 `catch` qui renvoient 500/502 et les `.catch(() => …)` des pages : `logError("<route>.<méthode>", e)`, idéalement via le helper de QUAL-05 (`serverError`).
  8. `instrumentation.ts` + `onRequestError` : facultatif, seulement pour un service externe.
- **Verdict** : partiel (deux vérifications) : faits exacts, « journaux vides » inexact pour les erreurs non attrapées ; sévérité ramenée à moyenne.

#### QUAL-19 — Aucun test automatisé : chiffrage et parties critiques à couvrir en premier (connu)

- **Sévérité** : moyenne · **Effort** : M (socle et tests unitaires) ; L pour l'émulateur et Playwright · **Vérification** : partiel
- **Emplacement** : `package.json` (pas de script `test`) ; `src/lib/*-shared.ts`, `format.ts`, `security.ts`, `rate-limit.ts`, `src/app/api/recommendations/route.ts:43-115`
- **Preuve** : aucun `*.test.*` ni `*.spec.*`, aucun runner. Les modules purs ont été exécutés tels quels sous Node 24 pendant l'audit (sanitizeSnapshot, cleanText, splitAuthorName, APA/BibTeX, isPublicPdfUrl, parseSearchParams, rateLimit, rejectCrossSite, markSpans). Le classement de « Pour vous » est écrit dans le handler. 86 commits en 30 jours ; dev = main = prod, avec une seule base Firestore (la production). Des tests simples auraient arrêté QUAL-01, QUAL-02, QUAL-06, QUAL-08, QUAL-32 et la faille du filtre SSRF (SEC-05).
- **Impact** : chaque refactorisation d'un assainisseur, d'une citation ou d'une transaction se valide à la main en production.
- **Recommandation** :
  1. (S) Socle : `npm i -D vitest happy-dom` ; scripts `"test": "vitest run"`, `"typecheck": "tsc --noEmit"` ; `vitest.config.ts` avec `test.environment: "node"` (happy-dom par fichier) et `resolve.alias` `{ "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "node_modules/next/dist/compiled/server-only/empty.js") }`. Installer `server-only` seul ne suffit pas : son `index.js` lève une exception hors condition react-server.
  2. (M, ~1 j, ~60 cas) Modules importables tels quels : `format.ts` (`isPublicPdfUrl` avec `localhost.`, `x.nip.io`, `metadata.google.internal.`, IP décimale/hexa, `[::1]`, port 8080 ; `openAccessPdfUrls` ; `abstractFromInvertedIndex`), `favorites-shared.ts`, `highlights-shared.ts`, puis `rate-limit.ts` (`vi.useFakeTimers`) et `security.ts`. Extractions : `rankRecommendations(...)` vers `recommendations-shared.ts`, `parseSearchParams` vers `src/lib/search-params.ts`, `markSpans` vers un module sans React.
  3. (L, 2 à 3 j) Transactions sur émulateur : `firebase-tools` en dev, bloc `emulators` dans `firebase.json`, branche `projectId: "demo-sextant"` sans `cert` dans `adminApp()` si `FIRESTORE_EMULATOR_HOST` est défini, setup Vitest qui refuse de démarrer si `FIREBASE_SERVICE_ACCOUNT` est présent ; cas : limite de 1 000 favoris, cascade, `CollectionOrderError`, partage, vote, `createdAt`.
  4. (L, ~2 j) Playwright sur l'émulateur Auth, jamais contre la production.
  5. (S) CI : voir QUAL-20.
  Ordre : 1, 2 et CI avant QUAL-05, QUAL-10, QUAL-12 ; test d'`isPublicPdfUrl` dans le commit du correctif SSRF.
- **Verdict** : partiel. Constat connu et exact ; plusieurs précisions techniques corrigées (alias `server-only`, happy-dom, extraction nécessaire, risque d'écriture en production sans garde-fou émulateur).

#### NEW-1 — Articles rétractés non signalés hors de la fiche : autocomplétion, outil MCP get_article, favoris, listes et exports

- **Sévérité** : moyenne · **Effort** : M · **Vérification** : partiel
- **Emplacement** : `src/app/api/suggest/route.ts:26` ; `src/lib/mcp-tools.ts:92-116,129-139` ; `src/lib/favorites-shared.ts:10-22,33-47` ; `src/app/article/[id]/page.tsx:161-164` ; `src/app/a-propos/page.tsx:36`
- **Preuve** :
  1. Le filtre de `/api/suggest` (`type:…,primary_location.source.is_core:true,is_paratext:false`) n'a pas `is_retracted:false`, contrairement à `BASE_FILTERS` (openalex.ts:153). `GET /api/suggest?q=Ileal-lymphoid-nodular hyperplasia` propose d'abord W2117847125 (Wakefield 1998, `is_retracted: true`).
  2. `get_article` reçoit `is_retracted` (DETAIL_SELECT) mais ne l'écrit jamais : pour W2135110328 (« Visfatin… », Science 2005, rétracté, sans mention dans le titre), l'assistant reçoit une fiche normale et une APA prête à citer.
  3. `FavoriteSnapshot` n'a aucun champ de rétractation : favoris, `/liste` publiques, citations, exports APA/BibTeX, `get_my_favorites`, `get_list` ne signalent rien. Même la fiche copie une APA sans mention.
  4. La page À propos promet : « les documents rétractés sont exclus, et signalés si vous y accédez directement ».
- **Impact** : un étudiant ou un assistant IA branché par MCP peut citer un article rétracté sans avertissement ; un article rétracté après son ajout aux favoris n'est jamais signalé. Recherche, recommandations et articles proches excluent déjà les rétractés, et la fiche web affiche le badge : l'exposition réelle est le MCP, les instantanés et les exports.
- **Recommandation** :
  1. (S) `suggest/route.ts:26` : ajouter `is_retracted:false`.
  2. (S) `get_article` (l.98-113) : si `w.is_retracted`, ligne « ATTENTION : cet article a été rétracté (OpenAlex). Ne pas le citer comme source fiable. » après le titre et « [Article rétracté] » en fin d'APA ; idem pour l'article de départ de `get_related_articles`. Sur la fiche, paramètre `retracted` dans `toApa`/`toBibtex` (`note = {Retracted}`).
  3. (M) `getRetractedIds(ids)` dans `openalex.ts` (lots de 50, filtre `ids.openalex:…,is_retracted:true`, `select: "id"`, cache 3600 ; ne pas réutiliser `getWorksByIds`, qui les ferait disparaître) ; l'appeler côté serveur dans `/favoris`, `/liste/[token]` (badge) et les outils MCP (préfixe « [RÉTRACTÉ] ») ; passer un `Set` aux exports. Ne pas stocker le drapeau dans l'instantané (fourni par le client).
  4. (S) Ajuster la phrase d'À propos si le point 3 est reporté.
- **Verdict** : partiel (deux vérifications) : quatre faits exacts, filtres OpenAlex vérifiés ; sévérité ramenée de élevée à moyenne.

#### NEW-5 — Note d'article : la dernière saisie est perdue au rechargement, à la fermeture ou au retour arrière, et les sauvegardes concurrentes peuvent arriver dans le désordre

- **Sévérité** : moyenne · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/components/notes/article-note.tsx:21-22,33,36,53-56,59-68` ; `src/components/highlights/highlight-item.tsx:49,88-103` ; `src/app/article/[id]/page.tsx:76-81` ; `src/lib/notes.ts:57`
- **Preuve** : le commentaire l.53 annonce un enregistrement « 900 ms après la dernière frappe, et au départ de la page », mais le nettoyage (l.55) ne fait que `clearTimeout` ; aucun `pagehide`, `visibilitychange`, `keepalive` ni `sendBeacon` dans `src/`. La note d'un surlignage n'est enregistrée qu'au blur ou à Cmd+Entrée. `save()` n'a pas de numéro de séquence et `setNote` fait un `set` sans contrôle de version. Mécanisme le plus sérieux, relevé à la vérification : la fiche lit la note côté serveur et la passe en `initial`, jamais relue ; au retour arrière, Next réutilise l'ancienne charge RSC (doc du glossaire Next 16) : l'ancienne note s'affiche et, si l'utilisateur la complète, le PUT du texte entier écrase la version récente.
- **Impact** : perte silencieuse des dernières frappes (fenêtre de 900 ms) ou d'une note de surlignage en cours à la fermeture de l'onglet ; plus grave, écrasement d'une note récente après un retour arrière (déduit de la doc, non mesuré : écriture interdite).
- **Recommandation** :
  1. (S) Relire la note au montage : `` fetch(`/api/notes/${snapshot.id}`, { cache: "no-store" }) `` (route GET existante) et l'appliquer si l'utilisateur n'a rien tapé ; même chose pour les surlignages dans `HighlightsProvider`, ou `router.refresh()` sur `popstate`.
  2. (S) Vider la sauvegarde en attente : `pendingRef` et `savedRef` (comparer à `savedRef.current`, pas à l'état capturé l.33) ; `flush()` qui fait `fetch(url, { method: "PUT", keepalive: true, … })`, appelé au nettoyage, sur `pagehide` et sur `visibilitychange` caché (corps < 64 Ko et < 32 Ko de `rejectLargeBody`). Corriger le commentaire l.53.
  3. (S) Sérialiser : un seul PUT en vol (`inflightRef`), renvoi du dernier texte à la fin ; `seqRef` pour ignorer les réponses périmées.
  4. (S) `highlight-item.tsx` : `beforeunload` pendant l'édition si la note a changé, ou PATCH `keepalive` sur `pagehide`.
  5. Vérifier (compte de test) : modifier la note, attendre « Enregistré », aller sur « Toutes mes citations », faire Retour.
- **Verdict** : partiel. Code exact, mécanismes cités à l'origine surévalués (le blur enregistre avant une navigation par clic) ; sévérité moyenne maintenue grâce au mécanisme du retour arrière.

#### QUAL-05 — Routes API : garde-fous recopiés à la main, avec des trous (summary, clés, compte) et des codes d'erreur incohérents

- **Sévérité** : faible · **Effort** : M · **Vérification** : partiel
- **Emplacement** : `src/app/api/**` (`guard()` dans `collections/[id]/route.ts:16-25`, `collections/[id]/articles/route.ts:16-25`, `collections/[id]/share/route.ts:14-23`, `highlights/[id]/route.ts:14-23`, `notes/[workId]/route.ts:15-26`) ; `src/app/api/mcp/route.ts:31` ; `src/app/api/pdf/route.ts:24` ; `src/app/api/recommendations/route.ts:34`
- **Preuve** : `guard()` redéfinie dans 5 fichiers, `const PRIVATE` dans 9, 19 `getCurrentUser()`, 17 « Non connecté. », 15 `rateLimit` aux limites codées en dur (12 seaux). jscpd : 12 clones et 93 lignes dupliquées sur 1 235 (7,5 % des routes). Vrais trous : `/api/summary` sans limite ni contrôle d'origine (SEC-02) ; le MCP renvoie 401 `invalid_token` quand le quota est dépassé (NEW-7). Extraction de l'IP recopiée. Aucun `console.error` dans les `catch` : les 502 Firestore sont invisibles.
- **Impact** : les garde-fous dépendent de la mémoire du développeur ; changer une limite ou un message oblige à modifier une quinzaine de fichiers.
- **Recommandation** :
  1. (S) Corriger d'abord les deux vrais trous : SEC-02 et NEW-7.
  2. (M) `src/lib/api/guard.ts` exportant `PRIVATE`, `RATE_LIMITS` (collections 60/min, items/favorites/highlights/notes 90, keys 10, export 5, feedback-post 5/h, feedback-vote 60, pdf 30, reco 30, mcp 240, summary), `clientIp(req)`, `tooMany()`, `requireUser(req, { write?, maxBody?, bucket })` qui renvoie `{ user } | { refused }`, et `serverError(message, e)` (`console.error` puis 502). Remplacer les 5 `guard()` et les séquences en ligne ; pas de `withApi` ni de zod généralisé tant qu'il n'y a pas de tests.
  3. Ne pas traiter (sans impact mesuré) : `private, no-store` sur les erreurs, 500 au lieu de 502, message sur JSON invalide, limites sur GET/DELETE des clés.
  4. (S, optionnel) `RATE_LIMITS.suggest` et `.author` par IP (SEC-04).
- **Verdict** : partiel. Faits exacts ; mélange d'écarts sans effet et de deux vrais problèmes ; solution initiale surdimensionnée.

#### QUAL-06 — Date de création du compte écrasée à chaque connexion : « Membre depuis » et l'export RGPD sont faux

- **Sévérité** : faible · **Effort** : S · **Vérification** : confirmé
- **Emplacement** : `src/app/api/auth/session/route.ts:39-56` ; `src/app/compte/page.tsx:18-27` ; `src/app/api/account/export/route.ts:31,41`
- **Preuve** : le premier `set` (`mergeFields: ["email","name","picture","lastLoginAt"]`) exclut `createdAt`, mais la l.55 enchaîne `.set({ createdAt: FieldValue.serverTimestamp() }, { merge: true })`, qui remplace le champ à chaque connexion Google (présent depuis le commit d'origine 696479a).
- **Impact** : « Membre depuis » et `profile.createdAt` de l'export valent la date de la dernière connexion (donnée inexacte, RGPD art. 5.1.d) ; deux écritures par connexion. La vraie date reste dans `metadata.creationTime` de Firebase Auth ; écart faible aujourd'hui (comptes de moins de deux jours).
- **Recommandation** : remplacer les deux `set` par un seul :
  ```ts
  const { FieldValue, Timestamp } = await import("firebase-admin/firestore");
  const authUser = await auth.getUser(decoded.uid);
  await db.doc(`users/${decoded.uid}`).set({
    email: decoded.email ?? null, name: decoded.name ?? null, picture: decoded.picture ?? null,
    lastLoginAt: FieldValue.serverTimestamp(),
    createdAt: Timestamp.fromDate(new Date(authUser.metadata.creationTime)),
  }, { merge: true }).catch(() => undefined);
  ```
  Chaque compte retrouve sa vraie date à la prochaine connexion, sans migration. Alternative : transaction qui n'écrit `createdAt` que s'il est absent. En complément, repli sur `metadata.creationTime` dans `/compte` et l'export.
- **Verdict** : confirmé ; sévérité faible (bug d'exactitude mineur).

#### QUAL-07 — Variables d'environnement jamais validées : un AI_PROVIDER mal saisi fait planter toutes les fiches avec résumé

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/lib/ai.ts:24-33,46-52` ; `src/app/article/[id]/page.tsx:72,203` ; `src/lib/firebase/admin.ts:15-23` ; `src/app/api/auth/session/route.ts:28-63`
- **Preuve** : `const forced = process.env.AI_PROVIDER as Provider | undefined; if (forced) return forced;` est un simple cast. Sur copie du module : avec `AI_PROVIDER` = « Mistral », « openai » ou « mistral␠ » et sans `AI_MODEL`, `modelFor` lève `TypeError: Cannot read properties of undefined (reading 'defaultModel')`, appelé au rendu de la fiche (l.203) sans frontière d'erreur. `isAdminConfigured()` ne vérifie que la présence de `FIREBASE_SERVICE_ACCOUNT` : un JSON malformé affiche « Se connecter » puis chaque connexion échoue en « Jeton invalide. ».
- **Impact** : une faute de casse dans la console Vercel rend indisponibles toutes les fiches avec résumé (si `AI_MODEL` n'est pas défini) ; un compte de service mal collé casse la connexion. Visible dès le premier affichage et corrigé par retour arrière ; `/api/health` expose l'erreur d'init.
- **Recommandation** :
  1. `ai.ts:24-33` : liste blanche tolérante, `const forced = process.env.AI_PROVIDER?.trim().toLowerCase();`, retour seulement si la valeur est dans `["mistral", "groq", "openrouter", "anthropic"]`, sinon `console.warn` et détection par clé. Supprimer `isAiEnabled()` (l.46-48), non utilisée.
  2. `session/route.ts` : `adminAuth()` dans son propre try (échec → `console.error` et 503 « Comptes momentanément indisponibles ») ; 401 seulement pour les erreurs de jeton, avec `console.warn` du code Firebase.
  3. Facultatif : `isAdminConfigured()` mémorisé qui parse le JSON une fois et vérifie `project_id`, `client_email`, `private_key`.
- **Verdict** : partiel. Mécanisme exact ; exige aussi l'absence d'`AI_MODEL` ; « sans le moindre message » faux (`/api/health`).

#### QUAL-08 — Clés BibTeX vides pour un auteur ou un titre non latin sans année : BibTeX invalide et dédoublonnage cassé

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/lib/format.ts:134-146` ; `src/lib/favorites-shared.ts:97-163`
- **Preuve** : exécution des deux implémentations : pour un auteur et un titre chinois, japonais ou cyrilliques sans année, la clé est vide (`@article{,`) ; le mot du titre est choisi avant le filtrage `[^A-Za-z0-9]`, donc le repli ne joue pas. `bibtexAll` ne dédoublonne plus (regex `^@\w+\{([^,]+),`) : trois `@article{,` identiques. « Étude » devient « tude ». `toBibtex` émet `author = {},`. Autre défaut reproduit à la vérification : le suffixe `String.fromCharCode(97 + n)` dépasse « z » au 27e doublon et produit `@article{2020{,` puis `@article{2020|,`, ce qui casse le fichier.
- **Impact** : entrée impossible à citer par `\cite`, doublons ignorés (« Repeated entry ») ; fichier `.bib` cassé au-delà de 26 doublons d'une même clé. Cas surtout hors filtres par défaut (0 article sans année en zh/ja/ko/ru/ar avec les filtres de l'appli, ~349 000 dans OpenAlex).
- **Recommandation** :
  1. Une seule `bibKey(authorName, year, title, id)` dans `favorites-shared.ts` : `ascii = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]/g, "")` ; `word` choisi **après** filtrage (`title.split(/\s+/).map(ascii).find((x) => x.length > 3)`) ; si ni nom ni mot, repli `${last || "anon"}${year ?? "nd"}${shortId(id).toLowerCase()}`. Utilisée par `format.ts` et `favorites-shared.ts`.
  2. `format.ts:144` : n'émettre `author` que s'il y a des noms.
  3. `bibtexAll` : suffixe sans limite (`${key}-${n + 1}` en vérifiant `used`) et remplacement ancré `` entry.replace(/^(@\w+\{)[^,]*,/, `$1${newKey},`) ``.
  4. Tests : CJK/cyrillique sans année, « Étude » → « etude », 30 doublons.
- **Verdict** : partiel. Mécanisme reproduit ; portée de niche ; défaut du 27e doublon ajouté.

#### QUAL-09 — localStorage relu sans validation : une entrée corrompue rend l'accueil inutilisable

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/lib/recent.ts:15-29` ; `src/components/recently-viewed.tsx:42-59` ; `src/components/for-you.tsx:29`
- **Preuve** : `readRecent()` ne vérifie qu'`Array.isArray` puis caste. Reproduit : `sextant:recent = [null]` → « TypeError: Cannot read properties of null (reading 'id') » ; `[{ id: "W1", title: { x: 1 } }]` → « Objects are not valid as a React child » ; dans les deux cas, toute la page est remplacée par « This page couldn't load » en anglais. `[]` : accueil normal. Aggravant : `pushRecent` appelle `readRecent().filter(...)`, qui lève et est avalé par le `catch` : la corruption ne se répare jamais.
- **Impact** : un futur changement du format `RecentWork`, une extension ou une modification manuelle rend l'accueil inutilisable pour ce visiteur jusqu'au vidage des données du site. Aucun chemin actuel ne produit de donnée invalide.
- **Recommandation** :
  1. `recent.ts:15-23` : parser en `unknown`, garde `isRecentWork(w)` (objet non nul, `id` qui passe `WORK_ID`, `title` et `authors` chaînes, `venue` chaîne ou null, `year` nombre ou null, `isOa` booléen, `viewedAt` nombre), `list.filter(isRecentWork).slice(0, MAX)`. La liste filtrée est réécrite à la consultation suivante.
  2. `readHidden` valide déjà ses éléments ; le favori en attente est borné (rien à faire).
  3. Versionner la clé seulement lors d'un changement de format.
  4. `error.tsx` (QUAL-03).
- **Verdict** : partiel. Reproduit ; `readHidden` et le favori en attente mal localisés à l'origine ; probabilité faible.

#### QUAL-10 — Pas de client HTTP commun : 31 fetch écrits à la main et 3 jsonOrError qui traitent le 401 différemment

- **Sévérité** : faible · **Effort** : M · **Vérification** : partiel
- **Emplacement** : `src/components/favorites/favorites-provider.tsx:81-96` ; `src/components/highlights/highlights-provider.tsx:24-29,71,88,105` ; `src/components/highlights/citations-list.tsx:24-27` ; `src/components/ai-summary.tsx:26-35` ; `src/components/auth/auth-button.tsx:38-47,60` ; `src/components/auth/account-actions.tsx:19-29` ; `src/app/compte/page.tsx:41`
- **Preuve** : trois `jsonOrError` : l'un transforme un 401 en « Connectez-vous pour gérer vos listes. », un autre lève `Error("signin")` testé par `e.message === "signin"`, le troisième affiche « Non connecté. ». 13 corps JSON montés à la main, 10 `res.json().catch(() => ({}))` suivis d'un cast ; `ai-summary.tsx:31` appelle `res.json()` sans catch. Déconnexion et initiales dupliquées.
- **Impact** : le même 401 (session expirée, page restée ouverte) ouvre la connexion, affiche un toast ou un message brut selon l'écran. Bug visible : un 500 sans corps de `/api/summary` affiche « Unexpected end of JSON input » (QUAL-21). Le format `{ error }` des routes est déjà uniforme.
- **Recommandation** :
  1. (S) `ai-summary.tsx:31` : `await res.json().catch(() => ({}))`.
  2. (M) `src/lib/client/api.ts` : `class ApiError extends Error { constructor(public status: number, message: string) }`, `api<T>(path, { method?, json?, signal?, cache? })` (content-type et `JSON.stringify` si `json`, lecture tolérante, `ApiError(res.status, data.error ?? "Échec.")` si `!res.ok`), `needsSignIn(e)`. Supprimer les trois `jsonOrError` et `postFavorite` ; règle unique : un 401 ouvre la connexion, jamais de toast. Les GET simples (search-box, for-you, author-chip, read-pdf-button) peuvent rester en `fetch`.
  3. (S) `establishSession`, `completeRedirectSignIn` et `signOutEverywhere()` dans `src/lib/client/auth.ts` ; `initialsOf(user)` dans `src/lib/format.ts`.
- **Verdict** : partiel. Faits exacts ; impact exagéré (un 401 est rare, une partie des fetch n'analyse aucune erreur).

#### QUAL-11 — Décodage Firestore dupliqué : instantané d'article reconstruit 4 fois, cast de Timestamp 9 fois

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/lib/favorites.ts:15-31,44-46,76-78,83,92,115-117` ; `src/lib/shares.ts:73-85` ; `src/lib/highlights.ts:9-32` ; `src/lib/notes.ts:9-26` ; `src/lib/collections.ts:14` ; `src/lib/feedback.ts:14` ; `src/lib/api-keys.ts:18` ; `src/app/api/account/export/route.ts:31` ; `src/app/compte/page.tsx:21`
- **Preuve** : les ~11 champs de `FavoriteSnapshot` sont relus à la main dans 4 modules ; `as { toDate?: () => Date }` apparaît 9 fois ; `s as unknown as Record<string, unknown>` (favorites.ts:92) ; lecture de `favoriteIds` avec repli recopiée 3 fois.
- **Impact** : dette de lisibilité. Ajouter un champ obligatoire fait échouer la compilation aux 4 endroits (TypeScript strict) ; seule la perte d'un champ optionnel serait silencieuse. Toutes les écritures passent par `sanitizeSnapshot`.
- **Recommandation** :
  1. `favorites-shared.ts` : `snapshotFromData(input: unknown, fallbackId: string): FavoriteSnapshot` tolérante (types vérifiés un à un), utilisée par `toFavorite`, `shares.ts:72-85`, `highlights.ts:20-32`, `notes.ts:14-26`.
  2. `src/lib/firestore/decode.ts` (`server-only`) : `dateFromTimestamp(v)` et `isoFromTimestamp(v)` (test `typeof v?.toDate === "function"`, sans importer firebase-admin en synchrone) ; remplacer les 9 casts (garder la valeur brute à favorites.ts:83-87).
  3. `readFavoriteIds(user, fallback)` factorisé pour les l.44-46, 76-78, 115-117.
  4. favorites.ts:92 : `return { ...s, addedAt: addedAt.toISOString() };`.
  Vérifier à la main Favoris, `/liste`, Citations, Notes et l'export.
- **Verdict** : partiel. Duplication réelle ; « disparition sans bruit » limitée aux champs optionnels.

#### QUAL-12 — favorites-provider.tsx monolithique : 478 lignes, 6 responsabilités et 9 refs de synchronisation, sans tests

- **Sévérité** : faible · **Effort** : M · **Vérification** : partiel
- **Emplacement** : `src/components/favorites/favorites-provider.tsx:9-36,81-104,119-129,146-252,254-310,312-434,437-469` ; `src/components/favorites/favorite-button.tsx:7,33-37,79-92`
- **Preuve** : le fichier gère l'intention en attente (sessionStorage), le chargement et le rafraîchissement au focus, la bascule optimiste, le CRUD des listes, les liens de partage et l'index article → listes ; 9 `useRef` de synchronisation ; 18 membres de contexte. 8 commits en deux jours, dont 3 de correctifs (07e6d64 « closure périmée du sélecteur »). En cas d'échec, `deleteCollection` et `updateCollection` restaurent un instantané complet des listes, qui peut écraser une mutation parallèle.
- **Impact** : la logique client la plus délicate du site (optimisme, réponses périmées) est difficile à faire évoluer ; aucun bug visible aujourd'hui. Effets de rendu : PERF-12.
- **Recommandation** :
  1. (S) `pending-favorite.ts` : constantes, `writePendingFavorite`, `clearPendingFavorite`, `readPendingFavorite()`.
  2. (S) `favorites-api.ts` (ou le client de QUAL-10) : `postFavorite`, `jsonOrError` et les 8 appels en ligne.
  3. (M) `favorites-state.ts` pur : état `{ ids, added, collections }`, `favoritesReducer` (reset, loaded, toggleOptimistic/Revert, setInList/Revert, upsert/patch/removeCollection, setShareToken), `without`, `withId`, calcul de `membership` ; retours arrière par actions inverses ciblées. Le provider garde la synchronisation (`inFlight`, `mutationSeq`, `loadedFor`, écouteurs) et un seul miroir `stateRef`. Tests Vitest du reducer.
  4. Un seul provider d'état (favoris et listes sont couplés : `toggle` modifie les listes, une seule requête charge les deux), exposé par deux contextes (état, actions stables).
  5. Ne pas adopter `useOptimistic` (valeur liée à une transition, pas de lecture synchrone depuis les callbacks).
- **Verdict** : partiel. Faits presque tous exacts (18 membres, pas 16) ; « monolithique » fort pour un fichier cohérent ; deux remèdes initiaux écartés.

#### QUAL-13 — Blocs d'interface recopiés (cartes d'article, états vides, puces de filtre, copie, téléchargement) et code mort dans WorkCard

- **Sévérité** : faible · **Effort** : M · **Vérification** : partiel
- **Emplacement** : `src/components/work-card.tsx:30-79` ; `src/components/favorites/favorites-list.tsx:139-158,323-365,375-392` ; `src/app/liste/[token]/page.tsx:59-77` ; `src/components/recently-viewed.tsx:41-60` ; `src/components/highlights/citations-list.tsx:152-157` ; `src/components/feedback/feedback-board.tsx:97-111` ; `src/components/empty-state.tsx`
- **Preuve** : la carte (badges, sujet, titre en lien étiré, auteurs · revue · année, citations) est écrite 3 fois et sa ligne de métadonnées 5 fois. `EmptyState` n'est utilisé que par `results.tsx`, alors que 10 états vides sont réécrits dans 6 fichiers. Puces de filtre quasi identiques (2 occurrences). Téléchargement `.bib` écrit 2 fois, copie avec « Copié » 5 fois (un `useCopy` local existe dans `mcp-keys.tsx:13-25`). `work-card.tsx:30` : `const favorites = true;` puis `favorites && …`.
- **Impact** : chaque évolution d'une carte est à faire trois fois ; seul écart réel constaté : `CopyButton` ignore l'échec du presse-papiers sans toast.
- **Recommandation** (vérification manuelle de `/`, `/search`, `/favoris`, `/liste/[token]`, `/article/[id]`, `/citations`, `/retours`) :
  1. (S) `work-card.tsx` : supprimer la l.30, bloc FavoriteButton inconditionnel, `pr-10` en dur.
  2. `src/components/article-card.tsx` : `ArticleBadges`, `ArticleMeta`, `ArticleCitations`, `ArticleCard({ snapshot, as = "h3", actions?, footerExtra?, children?, className? })`, branchés sur favoris, `/liste` (`as="h2"`), `WorkCard` (qui garde résumé et langue : ne pas passer par `snapshotFromWork`), citations et récents.
  3. `EmptyState` : `icon?`, `action?`, `className?`, utilisé pour les 10 états vides (pas pour les encarts p-4/p-5).
  4. `useCopy` déplacé dans `src/lib/use-copy.ts` et réutilisé par `copy-button`, `shared-list-actions`, `highlight-item`, `share-dialog`.
  5. `SharedListActions` renommé `BibtexActions({ articles, filename })` et réutilisé dans `favorites-list.tsx`.
  6. Optionnel : `Chip` vers `src/components/filter-chip.tsx` ; `fold()` ×3 dans `format.ts` (QUAL-30).
- **Verdict** : partiel. Emplacements exacts ; « 14 fois dans 9 fichiers » faux (10 dans 6) ; écarts de marges voulus.

#### QUAL-14 — Identifiants validés par 5 à 6 regex différentes, dont une sans limite de longueur ni de casse

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/lib/favorites-shared.ts:31` ; `src/app/api/recommendations/route.ts:13` ; `src/app/article/[id]/page.tsx:53,61` ; `src/app/article/[id]/lire/page.tsx:19,26` ; `src/app/api/summary/route.ts:32` ; `src/lib/mcp-tools.ts:20` ; `src/app/api/author/route.ts:9,11` ; `src/app/theme/[slug]/page.tsx:58` ; `src/components/author-chip.tsx:38-39`
- **Preuve** : `WORK_ID = /^W\d{1,31}$/`, `PLAUSIBLE_ID = /^W\d{2,15}$/` (rejet de W1 voulu : OpenAlex refuse tout le lot), `/^W\d+$/i` ×3 (fiche, lecteur, summary), `/^W\d{2,15}$/i` (MCP) ; `/^[A-Za-z0-9_-]{1,64}$/` ×4 ; `/^A\d+$/i`, `/^I\d+$/i` sans borne ; `shortId` réécrit 3 fois, préfixe DOI 5 fois. Mesures : `/article/w2741809807` → 200 sans canonical ; `/article/W99999999999999999998` → 10,5 s (504 OpenAlex puis relance) ; `/api/pdf?work=W` + 20 chiffres passe `{1,31}` et répond en 19,4 s.
- **Impact** : règles différentes selon le point d'entrée ; identifiants de 20 chiffres ou plus qui occupent une fonction 10 à 19 s sur des routes publiques (dont `/api/summary`, sans limite) ; URL en minuscules en double (marginal : liens internes toujours en majuscules).
- **Recommandation** :
  1. `src/lib/ids.ts` sans import : `WORK_ID = /^W\d{2,12}$/`, `AUTHOR_ID`, `INSTITUTION_ID` (`{2,12}`), `DOC_ID = /^[A-Za-z0-9_-]{1,64}$/`, `normalizeWorkId(raw)` (trim, majuscules, test), `shortId`, `doiPath(doi)`.
  2. Fiche et lecteur : `` const wid = normalizeWorkId(id); if (!wid) notFound(); if (wid !== id) permanentRedirect(`/article/${wid}`) `` ; validation avant `getWork` dans `generateMetadata` ; `alternates.canonical` (et `metadataBase`, QUAL-18).
  3. `summary/route.ts:32` : `normalizeWorkId` et clé de cache normalisée ; MCP : `.regex(/^W\d{2,12}$/i).transform((s) => s.toUpperCase())`.
  4. Importer `DOC_ID`, `AUTHOR_ID`, `INSTITUTION_ID`, `shortId`, `doiPath` aux autres emplacements.
- **Verdict** : partiel. Faits exacts ; W1 rejeté volontairement ; doublons de cache et de référencement marginaux.

#### QUAL-15 — Frontière serveur/client floue : openalex.ts et ai.ts sans server-only, client OpenAlex dans le graphe navigateur

- **Sévérité** : faible · **Effort** : M · **Vérification** : partiel
- **Emplacement** : `src/lib/openalex.ts:175-183,211` ; `src/lib/ai.ts` ; `src/components/for-you.tsx:10` ; `src/components/work-card.tsx:4` ; `src/lib/favorites-shared.ts:2` ; `src/components/search-box.tsx:9`
- **Preuve** : `openalex.ts` (qui lit `OPENALEX_API_KEY`) et `ai.ts` (7 variables) n'importent pas `server-only`, alors que 12 autres modules le font. `openalex.ts` est importé en valeur côté client (`shortId` dans for-you, work-card, favorites-shared) : en dev, le module entier est livré au client (variable lue sur un `process` vide). En production, le tree-shaking ne garde que `shortId` : aucune occurrence d'`api.openalex.org` dans les chunks. `search-box.tsx:9` importe un type depuis une route (effacé).
- **Impact** : aucune fuite aujourd'hui ; un futur import serveur dans ces modules passerait le build sans erreur.
- **Recommandation** :
  1. `src/lib/openalex-ids.ts` (sans `server-only`) contenant `shortId` ; `openalex.ts:211` : `export { shortId } from "./openalex-ids";`.
  2. Imports client de `for-you.tsx:10`, `work-card.tsx:4`, `favorites-shared.ts:2` vers `@/lib/openalex-ids` (les `import type { Work }` restent).
  3. `import "server-only";` en l.1 de `openalex.ts` et `ai.ts` ; `npx next build` pour vérifier.
  4. Facultatif : type `Suggestion` dans `src/lib/suggest-shared.ts`.
  5. Documenter la convention dans `AGENTS.md` (voir QUAL-42).
- **Verdict** : partiel. Faits de base exacts, impact nul en production, refactor initial surdimensionné.

#### QUAL-16 — Métadonnées des fiches article streamées dans le `<body>` : meta description non détectée (SEO 90)

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/article/[id]/page.tsx:52-57` ; `next.config.ts` (pas de `htmlLimitedBots`)
- **Preuve** : Lighthouse note `meta-description` à 0 sur `/article/W4406431707` (mobile et desktop) et sur `/lire`. curl avec l'UA Chrome ou Googlebot : `</head>` à l'octet 1 840, `<title>` et `<meta name="description">` vers l'octet 58 100, dans le body (streaming des métadonnées de Next 16, `generateMetadata` attendant `getWork`). Avec `Chrome-Lighthouse` ou `Twitterbot` dans l'UA (liste par défaut de Next), la meta est dans le head.
- **Impact** : le score SEO 90 est un artefact de Lighthouse local (PageSpeed Insights a le jeton `Chrome-Lighthouse`). Les générateurs d'aperçus courants sont déjà servis en rendu bloquant. Risque résiduel : Googlebot seul, volontairement classé robot « DOM » par Next ; effet plausible mais non démontré.
- **Recommandation** :
  - Option (S) pour servir la meta dans le head à Googlebot : `htmlLimitedBots: new RegExp(DEFAULT_HTML_LIMITED_BOTS + "|Googlebot", "i")`, où la chaîne par défaut est **copiée** depuis `node_modules/next/dist/shared/lib/router/utils/html-bots.js:15` (étendre, ne pas remplacer ; ne pas importer ce chemin interne ; comparer à chaque mise à jour de Next). Contrepartie : TTFB plus long pour Googlebot. Vérifier avec `curl -A "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"`.
  - Plus utile (S) : `openGraph`, `twitter` et `alternates.canonical` dans `generateMetadata`, `metadataBase` dans `layout.tsx` (QUAL-18).
- **Verdict** : partiel. Mécanisme réel ; impact et recommandation initiaux faux (la regex proposée retirait des robots de la liste par défaut).

#### QUAL-17 — Ni robots.txt ni sitemap, et recherche interne indexable

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/` (ni `robots.ts` ni `sitemap.ts`) ; `src/app/search/page.tsx:12-16` ; `src/app/favoris/page.tsx:11` ; `src/app/citations/page.tsx:12`
- **Preuve** : `/robots.txt` et `/sitemap.xml` → 404 en production. `/search` n'envoie ni meta robots ni `X-Robots-Tag`, est dynamique, et la fiche y renvoie par de nombreux liens (`?cites=`, `?topic=`, `?q=`, `?author=`, pagination).
- **Impact** : espace d'exploration infini pour les robots (chaque URL = une invocation serverless, requêtes OpenAlex en cache de données) ; pages de thème déjà découvertes par les liens de l'accueil. `/compte` redirige les anonymes ; `/favoris` et `/citations` n'affichent qu'une invitation à se connecter.
- **Recommandation** :
  1. `src/app/robots.ts` : `` { rules: { userAgent: "*", allow: "/", disallow: ["/search", "/api/", "/favoris", "/citations", "/compte", "/liste/", "/__/auth/"] }, sitemap: `${BASE}/sitemap.xml` } ``, avec `` BASE = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "sextant-psi.vercel.app"}` ``. Choisir **soit** le Disallow sur `/search`, **soit** `robots: { index: false, follow: true }` dans son `generateMetadata` (un robot ne lit pas le noindex d'une URL interdite).
  2. `src/app/sitemap.ts` : accueil, `` THEMES.map(t => `${BASE}/theme/${t.slug}`) ``, `/a-propos`, `/retours`, pages légales.
  3. `robots: { index: false }` dans les métadonnées de `/favoris` et `/citations`.
  4. Facultatif : `metadataBase` (QUAL-18).
- **Verdict** : partiel. Absences confirmées ; `/compte` non indexable, coût par URL limité ; recommandation initiale contradictoire corrigée.

#### QUAL-18 — Aperçus de partage absents (ni OpenGraph, ni metadataBase, ni canonical) et descriptions dupliquées

- **Sévérité** : faible · **Effort** : M · **Vérification** : partiel
- **Emplacement** : `src/app/layout.tsx:12-16` ; `src/app/theme/[slug]/page.tsx:20-23` ; `src/app/article/[id]/page.tsx:23-28,52-57` ; `src/app/liste/[token]/page.tsx:24-32` ; `src/lib/themes.ts:15-30`
- **Preuve** : `grep openGraph|metadataBase|twitter|alternates` dans `src/` : rien ; GET en production sur `/`, `/theme/informatique`, `/article/W2741809807` : aucune balise `og:*`, `twitter:*` ni `rel=canonical`. Pas d'`opengraph-image`, favicon en SVG seulement. Les 16 pages de thème ne renseignent que le titre (description racine reprise mot pour mot) alors que `THEMES` fournit une description. La description de la fiche est coupée en plein mot et absente sans résumé.
- **Impact** : les liens partagés s'affichent en carte texte (titre et description) sans image ni nom du site, et sans carte sur X ; descriptions dupliquées ; pas d'URL canonique (`/article/w…` en minuscules et variantes `?q`, `?sort` des thèmes).
- **Recommandation** :
  1. `layout.tsx:12` : `metadataBase: new URL(SITE.url)`, `openGraph: { siteName: "Sextant", locale: "fr_FR", type: "website" }`, `twitter: { card: "summary_large_image" }`. Ne pas mettre de title/description dans cet `openGraph` (Next 16 les hérite), et ne pas redéfinir d'objet `openGraph` dans les pages (fusion superficielle).
  2. `theme/[slug]/page.tsx:22` : ``description: `Articles scientifiques en ${theme.name} : ${theme.description}` `` et ``alternates: { canonical: `/theme/${theme.slug}` }``.
  3. Fiche : ``alternates: { canonical: `/article/${shortId(work.id)}` }``, description coupée au dernier espace avant 160 caractères avec « … », repli auteurs · revue · année.
  4. `src/app/opengraph-image.tsx` (1200×630, `ImageResponse`) et `apple-touch-icon` (NEW-10).
  5. `/liste/[token]` : rien à changer (garder noindex, pas de canonical).
  6. (M, optionnel) Image par article avec `revalidate`.
- **Verdict** : partiel. Absences confirmées ; « sans aperçu » exagéré (repli sur title et description) ; sévérité faible.

#### QUAL-20 — Pas de CI, pas de script typecheck, et un lint que plus rien n'exécute (Next 16 ne le lance plus au build) (connu)

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `package.json:5-11` ; `.github/` absent ; protection des branches `main` et `dev`
- **Preuve** : scripts dev, build, start, `"lint": "eslint"`, postinstall ; pas de `.github/workflows` ni de Dependabot. Next 16.3.6 ne lance plus ESLint au build (dist/build/index.js). En local : `tsc --noEmit --incremental false` en 3,1–3,7 s et `eslint .` en 4,2–4,3 s, 0 erreur. `gh api …/branches/main/protection` et `…/dev/protection` → 404 « Branch not protected ». Chaque PR reçoit déjà le statut Vercel (build d'aperçu, donc typage complet).
- **Impact** : le lint dépend de la discipline du développeur, aucun test (QUAL-19) et aucun statut obligatoire : on peut fusionner même si l'aperçu Vercel échoue. Une CI serait verte dès le premier jour.
- **Recommandation** :
  1. `package.json` : `"typecheck": "tsc --noEmit --incremental false"` et `"lint": "eslint --max-warnings=0 ."`.
  2. `.github/workflows/ci.yml` sur `pull_request` vers `dev` et `main` : `actions/checkout@v4`, `actions/setup-node@v4` (`node-version: 22`, `cache: npm`), `npm ci`, `npm run lint`, `npm run typecheck` (~1 min ; pas de `next build`, déjà fait par Vercel) ; `npm test` quand QUAL-19 existera.
  3. GitHub > Settings > Branches (ou Rulesets) : PR obligatoire et statuts `ci` et `Vercel` requis sur `main` et `dev`.
  4. Optionnel : `.github/dependabot.yml` (npm, hebdomadaire, groupes).
- **Verdict** : partiel. Constat connu ; seul le détail « lint plus exécuté par Next 16 » est nouveau ; le typage est déjà vérifié par les aperçus Vercel.

#### QUAL-21 — /api/summary relance les erreurs inattendues : réponse 500 vide, et le client affiche une erreur d'analyse JSON en anglais

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/api/summary/route.ts:58-67` ; `src/components/ai-summary.tsx:31-35` ; `src/lib/ai.ts:71,93`
- **Preuve** : le `catch` traduit `AiError` et les erreurs Anthropic connues, puis `throw e`. Next 16.3.6 renvoie alors `new Response(null, { status: 500 })`, un corps vide (app-route.js:359-361), et journalise l'erreur. Le client fait `await res.json()` sans protection puis affiche `e.message` : « Unexpected end of JSON input » (Chrome), « The string did not match the expected pattern » (Safari). Cas concrets : `TypeError: fetch failed` vers Mistral, réponse non JSON ; une coupure réseau côté client (« Failed to fetch ») s'affiche aussi telle quelle. Le `fetch` Mistral n'a pas de délai.
- **Impact** : message technique en anglais sur un chemin rare ; « Réessayer » reste disponible.
- **Recommandation** :
  1. (prioritaire) `ai-summary.tsx:31-35` : `const data = (await res.json().catch(() => ({}))) as { summary?: string; error?: string };` et, dans le `catch`, `data.error` ou « Synthèse indisponible pour le moment, réessayez. » au lieu d'`e.message`.
  2. `route.ts:67` : `console.error("[api/summary]", e); return NextResponse.json({ error: "Synthèse indisponible pour le moment." }, { status: 502 });`.
  3. `ai.ts:71` : `signal: AbortSignal.timeout(20_000)` et `AiError("Le service IA ne répond pas, réessayez.", 504)` ; `ai.ts:93` : `AiError("Réponse illisible du fournisseur IA.", 502)` si le JSON est illisible ; option `export const maxDuration = 30`.
- **Verdict** : partiel. Fond vrai ; pas de page HTML mais un corps vide, et l'erreur est bien journalisée par Next.

#### QUAL-22 — Condensé IA : la branche Anthropic vit dans la route et la traduction des erreurs est répartie entre ai.ts et la route

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/api/summary/route.ts:1,58-67,79-98` ; `src/lib/ai.ts:25-33,52,89-95`
- **Preuve** : la route contient sa propre `completeAnthropic` (bêta `server-side-fallback-2026-07-01`, `fallbacks: "default"`) avec `claude-opus-5` codé en dur dans `ai.ts:52`, alors que la production tourne sur Mistral. Erreurs traduites à deux endroits (`AiError` dans ai.ts, classes Anthropic dans la route l.64-66). Un seul appelant génère du texte.
- **Impact** : ajouter un fournisseur non compatible OpenAI ou un repli oblige à modifier la route ; le changement de fournisseur par variable fonctionne déjà. Branche Anthropic morte en production.
- **Recommandation** :
  - Option A (plus simple) : retirer Anthropic (voir PERF-20 : type `Provider`, `LABELS`, `activeProvider`, `modelFor`, `completeAnthropic`, dépendance). La route n'appelle plus que `completeOpenAiCompatible` et n'intercepte que `AiError`.
  - Option B : `export async function complete(system, user): Promise<string>` dans `ai.ts`, qui choisit le fournisseur, charge le SDK Anthropic à la demande (`await import`) et traduit ses erreurs en `AiError` (500, 429, 502) ; la route se réduit à `const raw = await complete(SYSTEM, userContent)`. Documenter `AI_MODEL` au lieu de `claude-opus-5` en dur.
  - Dans les deux cas, valider `AI_PROVIDER` (QUAL-07).
- **Verdict** : partiel. Faits exacts ; impact exagéré (un seul appelant).

#### QUAL-23 — Pas de module de compte : users/{uid} manipulé depuis 4 fichiers de app/, suppression de compte orchestrée dans la route

- **Sévérité** : faible · **Effort** : S · **Vérification** : confirmé
- **Emplacement** : `src/app/api/auth/session/route.ts:36-56` ; `src/app/compte/page.tsx:18-27` ; `src/app/api/account/export/route.ts:23-41` ; `src/app/api/auth/account/route.ts:17-32` ; aussi `src/lib/favorites.ts:42-48`, `src/lib/collections.ts:98`
- **Preuve** : `users/{uid}` est lu ou écrit directement dans 4 fichiers de `app/` (6 fichiers au total). La suppression de compte enchaîne dans la route 5 étapes sur 4 collections (shares en ligne, `deleteAllKeys`, `detachAuthor`, `recursiveDelete`, `deleteUser`), avec un `catch {}` muet. Conséquence vérifiée : le commit 879a78d a ajouté `detachAuthor` à la suppression, mais l'export RGPD n'a pas été mis à jour (voir NEW-2) ; `createdAt` écrasé (QUAL-06).
- **Impact** : chaque nouvelle collection et chaque champ de profil se gèrent route par route, sans journalisation : c'est exactement ainsi que l'export est devenu incomplet.
- **Recommandation** : `src/lib/users.ts` (`import "server-only"`) avec :
  1. `upsertProfile(decoded)` : transaction, `createdAt` écrit seulement si le document n'existe pas ; `.catch` avec `console.error("[profil]", e)`.
  2. `getMemberSince(uid)` pour `/compte` et l'export.
  3. `deleteAllShares(uid)` déplacé dans `src/lib/shares.ts`.
  4. `deleteAccount(uid)` qui enchaîne les étapes (idempotentes) en journalisant l'étape en échec ; la route se réduit à `await deleteAccount(user.uid)`.
  5. En tête de fichier, la liste unique des données par utilisateur, puis l'export complété (NEW-2). Contrôle : `grep -rn 'users/' src/app` ne renvoie plus que des commentaires.
- **Verdict** : confirmé ; sévérité faible (dette de structure, conséquence concrète sur l'export).

#### QUAL-24 — Constantes métier dupliquées entre client et serveur, variables d'environnement lues dans 8 fichiers

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/components/for-you.tsx:24,29,38` ; `src/lib/recommendations-shared.ts:16` ; `src/app/api/recommendations/route.ts:37-39` ; `src/components/feedback/feedback-board.tsx:216` ; `src/lib/feedback-shared.ts:30` ; `src/app/api/feedback/route.ts:24` ; `src/lib/auth.ts:21` ; `src/lib/firebase/client.ts:13-19` ; `src/app/api/health/route.ts:11-13`
- **Preuve** : limites de « Pour vous » codées côté client (30, 12, 200 ; `MAX_HIDDEN = 200` dans `recommendations-shared.ts:16`, et non `recent.ts`) et côté serveur (`ids(…, 12)`, 30, 200). Longueur minimale d'un titre de retour (5) écrite 3 fois, avec une normalisation différente (client `trim()`, serveur `cleanText`) : « a    b » passe côté client et reçoit un 400. Test « Firebase configuré » (3 variables `NEXT_PUBLIC_`) écrit 3 fois.
- **Impact** : changer une limite oblige à modifier client et serveur ; un oubli ne casse rien (le serveur coupe la liste).
- **Recommandation** :
  1. `recommendations-shared.ts` : `export const RECO_LIMITS = { seen: 12, fav: 30, hide: 200 } as const;`, utilisé par `for-you.tsx` et la route (import de valeur).
  2. `feedback-shared.ts` : `export const MIN_FEEDBACK_TITLE = 5;` ; `feedback-board.tsx:216` : `cleanText(title, MAX_FEEDBACK_TITLE).length >= MIN_FEEDBACK_TITLE` ; message construit avec la constante dans la route.
  3. `src/lib/firebase/config.ts` (ni `"use client"` ni `server-only`) qui lit les 3 variables par accès littéral et exporte `firebasePublicConfig` et `isFirebasePublicConfigured`.
  4. Pas de `lib/env.ts` monolithique mêlant secrets et variables publiques.
- **Verdict** : partiel. Duplication réelle, emplacement partiellement faux, impact surestimé.

#### QUAL-25 — .env.example ignoré par git (motif .env*) alors que le README y renvoie

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `.gitignore:34` ; `README.md:134,176` ; `src/lib/site.ts:3`
- **Preuve** : `git check-ignore -v .env.example` → `.gitignore:34:.env*` ; jamais versionné (`git log --all -- .env.example` vide). Le README demande `cp .env.example .env.local` et y renvoie par un lien ; sur GitHub (dépôt public), ce lien répond 404. La copie locale contient 13 clés vides et documente déjà `AI_PROVIDER` et `AI_MODEL` en commentaire (l.13, 18, 19).
- **Impact** : lien mort et procédure d'installation impossible à suivre depuis un clone.
- **Recommandation** : ajouter `!.env.example` juste après la l.34 de `.gitignore` ; vérifier `git check-ignore -v .env.example` (code 1) ; avant le commit, contrôler qu'aucune valeur n'est renseignée (`awk -F= '/^[A-Z_]+=/{if(length($2))print $1}' .env.example` ne doit rien afficher) ; `git add .env.example`.
- **Verdict** : partiel. Constat principal exact ; « ni AI_PROVIDER ni AI_MODEL » faux.

#### QUAL-26 — Dépendances inutilisées ou mal classées : next-themes mort, CLI shadcn en production (293 paquets), server-only non déclaré

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `package.json:13-32` ; `src/app/globals.css:3`
- **Preuve** : `next-themes` (package.json:23) n'est importé nulle part (thème via THEME_SCRIPT et `useDocumentTheme`). `shadcn@4.21.0` est en `dependencies` pour le seul `@import "shadcn/tailwind.css"` ; il fait passer la fermeture de production de ~318 à ~612 paquets (dont @modelcontextprotocol/sdk 1.30.1, ts-morph, @dotenvx/dotenvx, cn 0.2.6 en doublon). `server-only` est importé par 12 fichiers sans être déclaré (Next le résout en interne). Aucun effet sur le bundle client ni les fonctions (aucun `.nft.json` ne les référence).
- **Impact** : installation Vercel plus longue, surface de chaîne d'approvisionnement accrue, `package.json` infidèle. Les 8 alertes `npm audit` viennent de firebase-admin, pas de shadcn.
- **Recommandation** : `npm rm next-themes` ; `npm i -D shadcn@^4.21.0` (déplacé en devDependencies, installées par Vercel pour le build) puis `npm run build` ; `npm i server-only` facultatif (sous Vitest, il faudra de toute façon un alias, voir QUAL-19) ; `npm prune` en local pour les 6 paquets « extraneous » (dépendances WASM optionnelles de sharp).
- **Verdict** : partiel. Cœur exact ; arguments « bruit d'audit » et Vitest faux ou théoriques.

#### QUAL-27 — Types Node 20 pour un runtime Node 24, et aucun champ engines

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `package.json` (devDependencies `@types/node ^20` ; pas de champ `engines`)
- **Preuve** : `@types/node` 20.19.43 installé, production en Node v24.20.0 (`/api/health`), poste local en v24.7.0 ; ni `engines`, ni `.nvmrc`, ni `.node-version`. Le code n'utilise que `node:crypto`, `node:fs`, `node:path`, `node:url`, déjà typés en Node 20 ; `tsc --noEmit` passe.
- **Impact** : aucun défaut de typage aujourd'hui ; la version majeure de Node dépend d'un réglage de la console Vercel et non du dépôt (Node 20 en fin de vie depuis avril 2026).
- **Recommandation** : `"@types/node": "^24"` puis `npm install` ; `"engines": { "node": "24.x" }` (prioritaire sur le réglage de la console Vercel) ; `.nvmrc` à « 24 » en option ; vérifier `npx tsc --noEmit` et le premier déploiement. Ne pas regrouper avec TypeScript 7 et ESLint 10 (migrations distinctes).
- **Verdict** : partiel. Faits exacts ; impact sur le typage théorique, seul le risque de reproductibilité est réel.

#### QUAL-28 — Code mort : composants, ré-export utils.ts, exports inutilisés et SVG de create-next-app

- **Sévérité** : faible · **Effort** : S · **Vérification** : confirmé
- **Emplacement** : `src/components/ui/card.tsx` ; `src/components/ui/tooltip.tsx` ; `src/lib/utils.ts` ; `public/{file,globe,next,vercel,window}.svg` ; `src/app/theme/[slug]/page.tsx:16`
- **Preuve** : knip : 3 fichiers inutilisés (`card.tsx` 102 l., `tooltip.tsx` 65 l., `lib/utils.ts`, ré-export de `cn` que personne n'importe mais qu'utilise `components.json:17` pour le CLI shadcn). 15 exports inutilisés hors primitives : deux fonctions réellement mortes (`isAiEnabled`, `clearHidden`) et 13 exports seulement en trop (`hashKey`, `sanitizePage`, `MAX_CONTEXT`, `MAX_PAGE`, `RECENT_KEY`, `HIDDEN_KEY`, `PENDING_FAVORITE_KEY`, `PdfReader`, `buildHref`, `firebaseConfig`, `isFirebaseConfigured`, `splitAuthorName`, `bibtexFromSnapshot`). 5 SVG du commit initial non référencés. `generateStaticParams` des thèmes sans effet (page dynamique).
- **Impact** : bruit de maintenance, fausses API publiques.
- **Recommandation** : supprimer `card.tsx` et `tooltip.tsx` ; garder `lib/utils.ts` avec un commentaire « relais exigé par components.json » ; supprimer `isAiEnabled` (ai.ts:46-48) et `clearHidden` (recommendations-shared.ts:45-51, ou le brancher, voir A11Y-20) ; retirer le mot-clé `export` des 13 autres puis `npx tsc --noEmit` ; `git rm` des 5 SVG ; supprimer `generateStaticParams` tant que la page lit `searchParams` ; script `"knip": "knip"` et `knip.json` ignorant `src/components/ui/**` et `src/lib/utils.ts`.
- **Verdict** : confirmé ; sévérité faible.

#### QUAL-29 — Quatre handlers GET d'API sans aucun appelant, dont /api/favorites?full=1 (1 000 lectures par appel)

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/api/favorites/route.ts:22,30` ; `src/app/api/collections/route.ts:14-23` ; `src/app/api/highlights/route.ts:14-26` ; `src/app/api/notes/[workId]/route.ts:28-36`
- **Preuve** : aucun appelant (`src/`, `docs/`, scripts, README) pour la branche `?full=1` de `GET /api/favorites`, `GET /api/collections`, `GET /api/highlights`, `GET /api/notes/[workId]`. `GET /api/favorites` sans `full` est, lui, utilisé (favorites-provider.tsx:155).
- **Impact** : surface d'API à maintenir sans usage. Pas de gain de sécurité : les mêmes lectures sont possibles par les pages `/favoris` et `/citations` et par le MCP (SEC-07).
- **Recommandation** : supprimer la branche `?full=1` (et le commentaire l.22, l'import `listFavorites`), le GET de `collections/route.ts` (et `listCollections`), le GET de `highlights/route.ts` (et `listHighlights`, `WORK_ID` si inutilisé), le GET de `notes/[workId]/route.ts` (et `getNote` ; `guard()` perd son paramètre `write`). Next répondra 405. Vérifier `npx tsc --noEmit` et `npm run lint`. À noter : NEW-5 propose d'utiliser `GET /api/notes/[workId]` pour relire la note au montage ; le garder dans ce cas.
- **Verdict** : partiel. Vrai pour trois handlers et la branche `full=1` ; faux pour `GET /api/favorites` ; pas une mesure de sécurité.

#### QUAL-30 — Utilitaires dupliqués : fold() ×4 avec des caractères invisibles, formateurs de dates sans fuseau, cleanText rangé au mauvais endroit

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/components/search-box.tsx:28-30` ; `src/components/favorites/favorites-list.tsx:34-36` ; `src/components/highlights/citations-list.tsx:20-22` ; `src/lib/mcp-tools.ts:34-36` ; `src/lib/format.ts:116-125` ; `src/app/compte/page.tsx:23` ; `src/lib/highlights-shared.ts:35-44` ; `src/lib/collections-shared.ts:26-38`
- **Preuve** : `fold()` (NFD, retrait des accents, minuscules) écrit 4 fois avec une regex contenant des caractères combinants littéraux invisibles (octets 314 200 à 315 257 selon `od -c`) ; la forme échappée existe déjà dans `favorites-shared.ts:167`. 7 `Intl.DateTimeFormat`, dont 5 avec `timeZone: "Europe/Paris"` ; `memberSince` (`compte/page.tsx:23`) sans fuseau : avec TZ=UTC, un compte créé à 00:30 heure de Paris le 11 mars s'affiche « 10 mars 2025 ». `formatDate` (format.ts:124) reçoit des dates seules OpenAlex et n'est pas en défaut. `cleanText` (générique) est rangé dans `highlights-shared` et importé par retours, notes et clés ; `sanitizeCollectionName/Description` réimplémentent la logique en collant `\n` et `\t` (« Mes\nlectures » → « Meslectures »).
- **Impact** : bug d'affichage réel sur « Membre depuis » (inscriptions entre minuit et 1–2 h) ; regex fragile à l'édition ; dépendances artificielles entre modules. `NumberFormat` recréé à chaque appel : ~18 µs, négligeable.
- **Recommandation** :
  1. `compte/page.tsx:23` : `timeZone: "Europe/Paris"`.
  2. `src/lib/text.ts` : `fold(s)` avec `s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()` (forme échappée), `cleanText` et `tooLong` déplacés ; remplacer les 4 copies de `fold` ; `sanitizeCollectionName/Description` réécrites sur `cleanText`.
  3. `src/lib/dates.ts` : `DATE_SHORT`, `DATE_TIME`, `DATE_LONG` en Europe/Paris, remplaçant les 5 constantes locales.
  4. `formatDate` : `timeZone: "UTC"` (dates seules), par prévention.
  5. Optionnel : `NumberFormat` mis en cache au niveau du module.
- **Verdict** : partiel. Duplication et bug `memberSince` confirmés ; « dates décalées » vrai pour un seul emplacement, coût de `NumberFormat` théorique.

#### QUAL-31 — Accès au stockage local recopié dans 6 fichiers, avec la règle set-state-in-effect désactivée dans plusieurs composants

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : stockage : `src/lib/recent.ts`, `src/lib/recommendations-shared.ts`, `src/components/welcome-dialog.tsx`, `src/components/theme-toggle.tsx`, `src/components/mcp-announcement.tsx`, `src/components/favorites/favorites-provider.tsx` ; désactivations : `for-you.tsx:32`, `welcome-dialog.tsx:15`, `recently-viewed.tsx:15`, `theme-toggle.tsx:18`, `highlights/pdf-reader.tsx:44`, `account/mcp-keys.tsx:66`, `favorites-provider.tsx:224`
- **Preuve** : ~13 blocs try/catch de 3 à 5 lignes autour de localStorage/sessionStorage dans 6 fichiers. 7 désactivations de `react-hooks/set-state-in-effect`, toutes commentées, dont 3 liées au stockage ; les autres lisent le DOM, l'API Fullscreen, `location.origin` ou vident l'état à la déconnexion. `npx eslint` : 0 erreur. Seul `readRecent` ne valide pas ses éléments (QUAL-09).
- **Impact** : duplication limitée ; motif « rendu en deux passes après hydratation » documenté par React, coût d'un rendu supplémentaire au montage.
- **Recommandation** :
  1. (S) Validation dans `readRecent` (QUAL-09).
  2. (S) `src/lib/client/storage.ts` : `safeGet`, `safeSet`, `safeRemove`, `readJson<T>(key, guard, fallback, area)`, utilisés par les 6 fichiers (sauf le script inline de `layout.tsx:19`).
  3. (S, facultatif) `useSyncExternalStore(noopSubscribe, getClient, getServer)` pour les valeurs client statiques : `welcome-dialog.tsx`, `pdf-reader.tsx:44`, `mcp-keys.tsx:66` (3 désactivations en moins). Pour `recently-viewed.tsx`, seulement avec un store notifié par `pushRecent`/`clearRecent` et un snapshot mis en cache sur la chaîne brute (sinon boucle infinie). Garder les désactivations légitimes (for-you, theme-toggle, favorites-provider).
- **Verdict** : partiel. Emplacements cités en partie faux (4 sur 6 ne touchent pas au stockage) ; impact exagéré.

#### QUAL-32 — cleanText et sanitizeCollectionName collent les mots séparés par une tabulation et cassent les émojis composés

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/lib/highlights-shared.ts:37` ; `src/lib/collections-shared.ts:28,35`
- **Preuve** : `.replace(/[\p{Cc}\p{Cf}]/gu, (c) => (c === "\n" ? "\n" : ""))` supprime `\t` (Cc) avant la normalisation des espaces : `cleanText("mot1\tmot2", 100)` → « mot1mot2 ». `\p{Cf}` supprime aussi ZWJ et ZWNJ (U+200D, U+200C) : l’émoji famille (👨 + ZWJ + 👩 + ZWJ + 👧) devient trois émojis, et les écritures persane et indiennes sont altérées. Les listes et la sélection sont déjà normalisées côté client ; restent les collages dans la citation manuelle, les notes et les retours.
- **Impact** : texte collé depuis un tableur ou un traitement de texte enregistré avec des mots fusionnés, dans des citations que l'utilisateur recopiera ; altération des citations en persan ou en écritures indiennes.
- **Recommandation** :
  1. `highlights-shared.ts:37` : `.replace(/[\t\v\f\u0085]/g, " ").replace(/[\p{Cc}\u200B\u2060\uFEFF\u202A-\u202E\u2066-\u2069]/gu, (c) => (c === "\n" ? "\n" : ""))` : contrôles d'espacement changés en espace, puis retrait des autres Cc, de l'espace sans chasse, du WORD JOINER, du BOM et des contrôles bidi ; ZWJ et ZWNJ conservés.
  2. `collections-shared.ts:28,35` : appeler `cleanText(input, MAX_COLLECTION_…)` (après déplacement dans un module commun, QUAL-30), `|| null` pour le nom.
  3. Tests : « a\tb » → « a b », émoji famille intact, mot persan avec U+200C intact, « x\u202Ey » → « xy ».
- **Verdict** : partiel. Mécanisme reproduit ; exemple des listes inaccessible depuis l'interface ; impact surestimé mais point ZWNJ ajouté.

#### QUAL-33 — Déconnexion côté client : la réponse du serveur n'est pas vérifiée, et la logique existe en deux exemplaires

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/components/auth/auth-button.tsx:38-47` ; `src/components/auth/account-actions.tsx:19-29`
- **Preuve** : `await fetch("/api/auth/session", { method: "DELETE" })` sans tester `res.ok`, puis le toast « Vous êtes déconnecté. » quoi qu'il arrive ; en cas d'erreur réseau, la promesse rejetée n'est pas interceptée (aucun message). Code copié dans deux composants (seul `router.push("/")` diffère).
- **Impact** : faible : le DELETE ne fait aucune entrée/sortie (échec seulement en cas de panne de la plateforme), et `router.refresh()` réaffiche l'avatar si la déconnexion a échoué. Le cookie de 14 jours relève de SEC-08.
- **Recommandation** : hook `src/components/auth/use-logout.ts` :
  ```ts
  const router = useRouter();
  return async () => {
    let ok = false;
    try { ok = (await fetch("/api/auth/session", { method: "DELETE" })).ok; } catch {}
    try { await signOut(firebaseAuth()); } catch {}
    if (!ok) { toast.error("La déconnexion a échoué.", { description: "Vérifiez votre connexion puis réessayez." }); return; }
    toast("Vous êtes déconnecté.", { description: "À bientôt sur Sextant." });
    if (redirectTo) router.push(redirectTo);
    router.refresh();
  };
  ```
  `useLogout()` dans `auth-button.tsx`, `useLogout("/")` dans `account-actions.tsx` ; état `busy` en option. `signOut` s'exécute dans tous les cas (nettoyage local).
- **Verdict** : partiel. Faits exacts, impact exagéré.

#### QUAL-34 — La sonde HEAD du bouton « Lire le PDF » répond 404 et produit une erreur dans la console

- **Sévérité** : faible · **Effort** : S · **Vérification** : confirmé
- **Emplacement** : `src/components/highlights/read-pdf-button.tsx:23-25` ; `src/app/api/pdf/route.ts:75-88`
- **Preuve** : sur `/article/W4406431707`, Lighthouse note `errors-in-console` à 0 (« Failed to load resource: … 404 » sur `/api/pdf?work=W4406431707`), Best Practices 96. `curl -I` : `HTTP/2 404`, `x-vercel-cache: HIT`, `cache-control: public, max-age=600`. Le 404 vient de la l.86 (candidats non relayables) ; la l.84 est inatteignable depuis le bouton.
- **Impact** : bruit dans la console, 4 points perdus en bonnes pratiques sur une partie des fiches, 404 attendu confondu avec une vraie erreur dans la supervision.
- **Recommandation** : dans le HEAD, garder le 400 (l.81) ; l.84 et l.86, `new Response(null, { status: 204, headers: { "x-sextant-readable": "0", "cache-control": … } })` (en gardant les durées de cache actuelles) ; l.88, ajouter `"x-sextant-readable": "1"` ; mettre à jour le commentaire l.75-78. Client (`read-pdf-button.tsx:25`) : `if (!res.ok || res.headers.get("x-sextant-readable") === "0") setTarget("original");`. Laisser le GET tel quel.
- **Verdict** : confirmé ; impact cosmétique.

#### QUAL-35 — Le 401 du MCP annonce des métadonnées OAuth qui renvoient 404

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/api/mcp/route.ts:24-35` ; `node_modules/mcp-handler/dist/index.mjs:309-315`
- **Preuve** : en production, `GET /api/mcp` sans clé → 401 avec `www-authenticate: Bearer error="invalid_token", error_description="No authorization provided", resource_metadata="https://sextant-psi.vercel.app/.well-known/oauth-protected-resource"` ; cette URL (et `/.well-known/oauth-authorization-server`) renvoie 404 (page HTML de Next). Aucune route `.well-known` dans le dépôt. `withMcpAuth` construit toujours une URL non vide : l'option `resourceMetadataPath` ne suffit pas à retirer l'annonce.
- **Impact** : un client MCP qui suit la découverte OAuth échoue avec une erreur obscure quand la clé est absente ou invalide (cas où l'échec est de toute façon normal). Plus concret : le dépassement de quota produit le même 401 (NEW-7).
- **Recommandation** :
  1. Envelopper `authed` dans `withKeyHint(authed)` exporté en GET, POST, DELETE : sur 401, reconstruire la réponse sans `resource_metadata`, avec `WWW-Authenticate: Bearer error="invalid_token", error_description="Cle Sextant manquante ou invalide"` et un JSON `{ error: "invalid_token", error_description: "Clé Sextant manquante ou invalide : créez-en une dans Mon compte puis passez-la en Authorization: Bearer sxt_… ou ?key=sxt_…" }`.
  2. Dépassement de débit en 429 avec `Retry-After: 60` (NEW-7).
  3. Le jour où OAuth 2.1 arrive : `src/app/.well-known/oauth-protected-resource/route.ts` avec `protectedResourceHandler` de mcp-handler, puis retrait de l'enveloppe.
- **Verdict** : partiel. Faits exacts ; aucun client ne « se rabat sur la clé » ; l'option proposée à l'origine ne fonctionne pas.

#### QUAL-36 — Soft 404 : un article introuvable répond 200 à cause du loading.tsx du segment

- **Sévérité** : faible · **Effort** : S · **Vérification** : confirmé
- **Emplacement** : `src/app/article/[id]/loading.tsx` ; `src/app/article/[id]/page.tsx:52-53,61-63` ; `src/app/article/[id]/lire/page.tsx:18-19,26-28`
- **Preuve** : en production, `/article/W0`, `/article/abc` et `/article/W0/lire` → 200 avec `<title>Article introuvable · Sextant</title>`, « Page introuvable » et `noindex` (marqueur `NEXT_HTTP_ERROR_FALLBACK;404` dans le flux), alors que `/nexistepas` → 404. La doc Next (`loading.md`, « Status Codes ») le confirme : le streaming envoie 200 avant que `notFound()` puisse changer le statut. Sur `/article/W2741809807%3Fper-page%3D1`, le `<title>` est même celui du vrai article (SEC-15).
- **Impact** : soft 404 dans la Search Console ; la supervision et les liens morts (favori vers un identifiant fusionné chez OpenAlex) ne voient pas d'erreur HTTP. Indexation évitée par `noindex`.
- **Recommandation** :
  - Option A (vrai 404, S + vérification UX) : supprimer `loading.tsx` (suffit pour la fiche et le lecteur ; le Suspense des similaires reste). Contrepartie : plus de squelette immédiat en navigation client. Pour la limiter (M) : lectures personnelles dans un composant serveur sous `<Suspense>` avec un squelette de dimensions fixes (PERF-19), seul `getWork` restant bloquant.
  - Option B (garder `loading.tsx`, S) : `src/proxy.ts` avec `matcher: ["/article/:id", "/article/:id/lire"]` qui renvoie 404 si le segment ne correspond pas à `/^W\d+$/i` (couvre `abc` et `W…%3F…`, pas `W0`).
  - Dans les deux cas : `if (!/^W\d+$/i.test(id)) return { title: "Article introuvable" };` en tête des deux `generateMetadata`.
- **Verdict** : confirmé ; sévérité faible.

#### QUAL-37 — Écriture de lastUsedAt lancée sans attente dans une fonction serverless (utiliser after())

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/lib/api-keys.ts:62-66` ; `src/app/api/mcp/route.ts:29`
- **Preuve** : `void snap.ref.update({ lastUsedAt: FieldValue.serverTimestamp() }).catch(() => undefined)` (l.65) part sans être attendue ; l'erreur est avalée. Aucun `after()` ni `waitUntil` dans le dépôt.
- **Impact** : l'écriture se rattrape seule (la condition « plus d'une heure » reste vraie et chaque requête MCP relance l'écriture), donc « jamais utilisée » affiché pour une clé active est très improbable. Le vrai défaut : un échec persistant (quota, identifiants) disparaît sans trace, alors que c'est le seul signal d'usage d'une clé, utile pour repérer une clé exposée (clé en `?key=`, compromis connu).
- **Recommandation** : l.63-66, `await snap.ref.update({ lastUsedAt: FieldValue.serverTimestamp() }).catch((e) => console.error("[mcp] lastUsedAt", e));` (quelques dizaines de ms, une fois par heure et par clé). Variante équivalente : `import { after } from "next/server";` puis `after(() => snap.ref.update(…).catch((e) => console.error("[mcp] lastUsedAt", e)))`, valable tant que `verifyKey` n'est appelée que depuis une route. `logError` n'existe pas encore (QUAL-04).
- **Verdict** : partiel. Code exact ; impact exagéré, le vrai défaut est l'erreur avalée.

#### QUAL-38 — Nommage incohérent : collections/listes, highlights/surlignages/citations, deux types Theme, deux normalize()

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/lib/collections*.ts`, `src/app/api/collections/**`, `src/app/liste/[token]`, `src/components/highlights/**`, `src/app/citations`, `src/app/api/account/export/route.ts:44-45`, `src/app/compte/page.tsx:67`, `src/components/author-chip.tsx:118`
- **Preuve** : `collections` (Firestore, API, type) contre « listes » (interface, `?liste=`, `/liste/[token]`, export `lists`, MCP `list_my_lists`/`get_list`) ; `Highlight` et `/api/highlights` contre `/citations`, `citations-list.tsx`, export `citations`, toasts « Passage surligné » / « Citation supprimée » ; « Citations » désigne aussi le nombre de citations bibliométriques (tuile de `/compte` contre `author-chip.tsx:118`). Deux `Theme` (l'un local et non exporté), deux `normalize()` privés de sens différents. Les commentaires d'en-tête (collections-shared.ts:1, highlights-shared.ts:3-6) font déjà le lien.
- **Impact** : entrée dans le code un peu plus coûteuse ; seule ambiguïté visible par l'utilisateur : « Citations » sur `/compte`.
- **Recommandation** : glossaire de 3 lignes dans `AGENTS.md` (collections = listes ; highlights = surlignages/citations ; `cited_by_count` = citations bibliométriques) ; tuile `/compte` renommée « Passages cités » ou « Mes citations » ; facultatif : `git mv src/components/favorites/sign-in-prompt.tsx src/components/auth/` (2 imports), `normalize` renommés `foldAccents` et `collapseWhitespace`, `Theme` local renommé `ColorScheme`. Ne pas toucher aux noms Firestore, API, MCP ni à l'export.
- **Verdict** : partiel. Faits exacts ; « chercher list ne trouve pas les collections » faux ; les deux `Theme` et `normalize` ne se chevauchent pas.

#### QUAL-39 — Logique métier dans les pages et les outils MCP : « articles proches » différents entre le site et le MCP, algorithme de recommandation dans le handler

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/app/article/[id]/page.tsx:68,95,145-146,163-164,209,211,277-285` ; `src/lib/mcp-tools.ts:131-137` ; `src/app/article/[id]/lire/page.tsx:26-34` ; `src/app/api/pdf/route.ts:29,83` ; `src/app/api/recommendations/route.ts:43-115`
- **Preuve** : la page complète les apparentés par sujet s'il y en a moins de 3 (jusqu'à 9) ; `get_related_articles` complète dès qu'il y en a moins de `n` (6). Sur W2741809807, le site affiche 4 cartes, le MCP en renverrait 6 (mêmes apparentés, complément différent). Condition de lecture intégrée écrite dans la fiche (l.68, 145, 146, 209) et le lecteur (l.31), avec une troisième variante dans `/api/pdf` (sans `isPdf`). `snapshotFromWork(work)` appelé 4 fois : 4 copies identiques de l'objet dans le flux RSC (~0,45 Ko chacune). ~70 lignes de classement dans le handler de recommandations.
- **Impact** : dette de lisibilité ; résultats « proches » un peu différents entre site et MCP ; règles non testables sans lancer une route.
- **Recommandation** :
  1. (S) `getSimilarWorks(work, n, fillBelow = n)` dans `openalex.ts` (apparentés via `getWorksByIds`, complément `getWorksBySameTopic` si le total < `fillBelow`, dédoublonnage, `slice(0, n)`) ; `page.tsx:278-285` → `getSimilarWorks(work, 9, 3)` et `mcp-tools.ts:131-137` → `getSimilarWorks(w, n)`. Trancher la règle produit (compléter jusqu'à 6 sur le site aussi).
  2. (S) `canReadInline(w)` dans `format.ts` (`Boolean(openAccessUrl(w)?.isPdf) && openAccessPdfUrls(w).length > 0`), utilisé dans la fiche et le lecteur ; décider si `isPdf` reste obligatoire.
  3. (S) `const snapshot = snapshotFromWork(work);` une seule fois, réutilisé l.95, 163, 164, 211.
  4. (M, avec les tests) Extraire `weighSeeds`, `rankRelatedAndTopics`, `interleave` vers `src/lib/recommendations.ts`.
- **Verdict** : partiel. Faits exacts ; fichiers cibles de la recommandation initiale inexistants.

#### QUAL-40 — pdf-reader.tsx (445 lignes) : trois composants, des helpers DOM et un couplage par événement window global

- **Sévérité** : faible · **Effort** : M · **Vérification** : partiel
- **Emplacement** : `src/components/highlights/pdf-reader.tsx:16-21,32-103,105-144,152-338,348-445`
- **Preuve** : `ReaderLayout`, `PdfReader`, `PdfPage` et des fonctions pures (`markSpans`, `formatBytes`, `pageOf`, `normalize`). `ReaderLayout` et `PdfReader` communiquent par `window.dispatchEvent(new CustomEvent("sextant:goto-page"))` (l.20, 91, 244-251). `markSpans` joint toujours les fragments par un espace (l.118) : si PDF.js coupe un mot en deux spans (italique, exposant, texte espacé), la chaîne reconstruite ne correspond plus à la sélection et le surlignage n'apparaît pas, sans erreur.
- **Impact** : fichier difficile à tester (comme tout le dépôt) ; bus global inutile (un seul lecteur monté aujourd'hui) ; fragilité réelle de l'appariement.
- **Recommandation** :
  1. (S) Supprimer `GOTO_EVENT` et `goToPage` : prop `gotoRef?: React.RefObject<((page: number) => void) | null>` sur `PdfReader`, assignée dans un effet (`` containerRef.current?.querySelector(`[data-page="${p}"]`)?.scrollIntoView(...) ``) et appelée par `ReaderLayout` ; retirer l'`export` de `PdfReader`.
  2. (S) `src/lib/pdf-text-marks.ts` : `normalize` et `matchSpanIndexes(spanTexts, needles): Set<number>` (l.114-134 en renvoyant des index) ; n'insérer l'espace que si le fragment précédent finit par un blanc, ou apparier sans espaces avec une table de correspondance.
  3. Tests prioritaires : mot coupé en deux spans, césure sur deux lignes, occurrences multiples, casse différente.
  4. Découpage complet en `components/pdf/` : optionnel.
- **Verdict** : partiel. Découpage décrit exact ; scénario des deux lecteurs théorique ; la fonction s'appelle `normalize`, pas `normalizeSpace`.

#### QUAL-41 — openalex.ts (450 lignes) : types, client HTTP et requêtes mêlés, avec trois copies de « récupérer par identifiants »

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/lib/openalex.ts:10-120,187-208,253-260,263-322,332,357-364,372-379,413-424`
- **Preuve** : 110 lignes de types, le client `get` avec relance et 11 fonctions de requête. `getWorksByIds`, `getSeedMeta` et `getQualityWorksByIds` répètent la même séquence (`shortId`, filter, `slice(0, 50)`, filtre `ids.openalex:`, réordonnancement via `byId`). « 404 → null » répété 3 fois ; trio `BASE_FILTERS` + type + `CORE_SOURCE` + `has_abstract` recomposé dans 4 fonctions.
- **Impact** : chaque nouvelle requête recopie la mécanique. La limite de 50 et les doublons ne se déclenchent pas aujourd'hui (au plus 20 graines et 18 apparentés).
- **Recommandation** :
  1. `fetchByIds<T extends { id: string }>(ids, filters, select)` privé (dédoublonnage, `slice(0, 50)`, retour `[]`, `get<Page<T>>("/works", …, 3600)`, réordonnancement) ; les trois fonctions en une ligne chacune (`type SeedMeta = Pick<Work, …>`).
  2. `getOrNull<T>(path, params, ttl)` pour `getWork`, `getTopic` et `/authors`.
  3. `QUALITY_FILTERS` pour `getWorksBySameTopic`, `getQualityWorksByIds`, `getRecentByTopic` (pas `getFeaturedWorks`, volontairement sur `article|review`).
  4. Vérifier à la main les similaires et `GET /api/recommendations?fav=…` (mêmes articles, même ordre).
- **Verdict** : partiel. Duplication réelle (~30 lignes) ; risque « limite de 50, doublons » théorique.

#### QUAL-42 — README et AGENTS.md en retard sur le produit : promesses de confidentialité contredites, 3 routes documentées sur 22

- **Sévérité** : faible · **Effort** : S · **Vérification** : confirmé
- **Emplacement** : `README.md:22,94-98,134,138-163` ; `AGENTS.md` ; `CLAUDE.md`
- **Preuve** : le README affirme « Pas de compte, pas de bruit », « Aucun compte… » et « Seuls vos mots-clés partent vers OpenAlex », alors que le site propose la connexion Google, stocke dans Firestore et envoie les identifiants consultés à `/api/recommendations` ; sa propre feuille de route coche « Comptes (Google) » et « Serveur MCP ». La table « Pages et API » décrit 3 routes sur 22 et omet 7 pages sur 14 ; « Organisation » cite 5 fichiers de `lib` sur 27. `AGENTS.md` ne contient que le bloc généré par Next ; `CLAUDE.md` se limite à `@AGENTS.md`. Dépôt public. « aucun cookie de suivi » reste exact (seul `sextant_session`, strictement nécessaire).
- **Impact** : la vitrine publique du projet contredit `/confidentialite` ; un contributeur ou un agent IA ne trouve aucune trace des conventions (`server-only`, `*-shared.ts`, gardes des routes).
- **Recommandation** :
  1. `README.md:22` : « Sans compte obligatoire, sans publicité, sans presse ».
  2. `README.md:94-96` : quatre puces (compte Google facultatif et Firestore à Paris ; un seul cookie technique `sextant_session` de 14 jours, aucun suivi ni publicité ; historique local, identifiants envoyés pour « Pour vous » sans conservation ; OpenAlex reçoit recherches et identifiants, Mistral le titre et le résumé sur demande) ; l.98 : renvoyer vers https://sextant-psi.vercel.app/confidentialite.
  3. `README.md:138-150` : les 7 pages manquantes et les API par préfixe (`/api/auth/*`, `/api/account/*`, `/api/favorites`, `/api/collections/*`, `/api/highlights`, `/api/notes/[workId]`, `/api/feedback/*`, `/api/recommendations`, `/api/pdf`, `/api/mcp`, `/api/health`).
  4. `README.md:153-163` : la lib par familles (`*-shared.ts`, modules `server-only`, infrastructure).
  5. `README.md:134` : Firebase facultatif (sans ses variables, la connexion est masquée).
  6. `AGENTS.md` : section « Conventions du projet » **hors** du bloc `nextjs-agent-rules` (régénéré par `next dev`) : `server-only`, `*-shared.ts`, garde standard des routes, format `{ error }`, transactions, interface en français, circuit feat → dev → main, glossaire (QUAL-38).
- **Verdict** : confirmé ; preuve corrigée sur deux points (cookie de suivi, Firebase documenté dans `.env.example`).

#### QUAL-43 — Aucun contrôle d'accessibilité automatisé : les régressions ne sont pas détectées (connu)

- **Sévérité** : faible · **Effort** : M · **Vérification** : partiel
- **Emplacement** : transversal (`package.json`, `eslint.config.mjs`, pas de `.github/`)
- **Preuve** : pas de tests ni de CI (connu) ; `scripts/` ne contient que `copy-pdfjs-assets.mjs`. Les défauts majeurs de l'audit (débordement mobile, `nested-interactive`, h1 manquant) sont détectables automatiquement ; le banc de l'audit (Playwright + axe-core, 8 pages × 2 thèmes + 3 états) tourne en ~2 min. eslint-config-next active 6 règles jsx-a11y en « warn », qui ne couvrent aucun de ces défauts et ne tournent qu'à la main.
- **Impact** : chaque nouvelle page ou modification de l'en-tête peut réintroduire une régression (A11Y-01 en est l'exemple).
- **Recommandation** (à fusionner dans QUAL-20) :
  1. `@playwright/test` et `@axe-core/playwright` en devDependencies ; script `"test:a11y": "playwright test tests/a11y.spec.ts"`.
  2. `tests/a11y.spec.ts` : pour chaque page publique, en clair et sombre, `new AxeBuilder({ page }).withTags(["wcag2a","wcag2aa","wcag21aa","best-practice"]).analyze()`, échec sur tout impact serious ou critical **et** explicitement sur `page-has-heading-one`, `landmark-one-main`, `region` (moderate) ; à 320 px, `scrollWidth <= clientWidth` ; blocage de toute requête autre que GET/HEAD via `page.route`.
  3. Déclenchement sur `deployment_status` des aperçus Vercel (`BASE_URL` = URL de l'aperçu), pour ne pas déposer le compte de service de production dans la CI.
  4. (S) `jsx-a11y.flatConfigs.recommended` en « error » dans `eslint.config.mjs` (plugin déclaré en devDependency).
- **Verdict** : partiel. Déclinaison du constat connu ; la recommandation initiale (seuil serious seul) aurait laissé passer le h1 manquant.

#### NEW-6 — Connexion : le repli par redirection échoue en silence, car authDomain reste sur firebaseapp.com et le rewrite /__/auth/* n'est pas utilisé

- **Sévérité** : faible · **Effort** : S · **Vérification** : confirmé
- **Emplacement** : `next.config.ts:8-14` ; `src/lib/firebase/client.ts:21-23` ; `src/components/auth/sign-in-dialog.tsx:5,48-51,90-103` ; `src/components/auth/auth-button.tsx:21,32-36`
- **Preuve** : dans le bundle de production, `apiKey`, `projectId` et `appId` sont inlinés mais pas `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` (`` …env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim()||`${projectId}.firebaseapp.com` ``) : l'authDomain est un domaine tiers. Le rewrite `/__/auth/*`, présenté comme la parade aux cookies tiers, répond 200 mais rien ne l'utilise. Sur `auth/popup-blocked`, le code bascule sur `signInWithRedirect`, que Firebase déconseille avec un authDomain différent du site (Chrome M115+, Firefox 109+, Safari 16.1+) ; `completeRedirectSignIn` avale toute erreur (`catch { return false }`) et `onSuccess?.()` est appelé avant la redirection. Le domaine tiers est un choix documenté (commit d8ba213, `redirect_uri_mismatch`).
- **Impact** : l'utilisateur dont la fenêtre surgissante est bloquée revient sur le site sans être connecté, sans message. Chemin rare (popup lancée dans la foulée du clic).
- **Recommandation** :
  - Option recommandée (S) : dans `sign-in-dialog.tsx:48-52`, remplacer la branche `popup-blocked` par `setError("Votre navigateur a bloqué la fenêtre de connexion Google. Autorisez les fenêtres surgissantes pour ce site, puis réessayez."); setBusy(false); return;` (sans `onSuccess`) ; pour `auth/operation-not-supported-in-this-environment`, « Ouvrez Sextant dans votre navigateur (Safari, Chrome…) pour vous connecter. » ; supprimer `completeRedirectSignIn`, les imports `getRedirectResult`/`signInWithRedirect` et l'effet de `auth-button.tsx:32-36` (ce qui règle aussi l'essentiel de PERF-02). Supprimer `rewrites()` ou corriger son commentaire (« inactif tant que NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN n'est pas définie »).
  - Autre option (M) : domaine propre (URI `https://sextant-psi.vercel.app/__/auth/handler` autorisée dans le client OAuth Google Cloud, domaine autorisé dans Firebase Auth, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=sextant-psi.vercel.app` en Production, redéploiement, tests Safari et Firefox).
  - Si `getRedirectResult` reste : `catch (e) { console.error(e); toast.error("La connexion n'a pas abouti. Réessayez."); return false; }`.
- **Verdict** : confirmé ; proxy sans risque de sécurité, commentaire trompeur ; sévérité faible.

#### NEW-7 — MCP : un dépassement de quota ou une panne Firestore répond « invalid_token » (401) au lieu de 429 ou 503

- **Sévérité** : faible · **Effort** : S · **Vérification** : confirmé
- **Emplacement** : `src/app/api/mcp/route.ts:29-31` ; `node_modules/mcp-handler/dist/index.mjs:321-335`
- **Preuve** : `const found = await verifyKey(key).catch(() => null)` puis `` if (!rateLimit(`mcp:${found.keyId}`, 240, 60_000)) return undefined; ``. Avec `required: true`, `withMcpAuth` transforme ce `undefined` en `OAuthError(InvalidToken, "No authorization provided")`, donc 401 avec `WWW-Authenticate: invalid_token` et `resource_metadata` pointant vers un 404 (QUAL-35). `withMcpAuth` renvoie aussi 401 pour toute exception de `verifyToken`. Mesure (GET local sans clé) : 401 et cet en-tête.
- **Impact** : un agent qui dépasse 240 appels/min ou une panne passagère fait croire au connecteur (claude.ai, ChatGPT) que la clé est révoquée ; message « No authorization provided » faux quand une clé valide est fournie. Probabilité faible, réaction exacte des clients non vérifiée.
- **Recommandation** : trier les cas avant `withMcpAuth` :
  ```ts
  const verified = new WeakMap<Request, { uid: string; keyId: string }>();
  // rappel de withMcpAuth : lit verified.get(req) et renvoie l'authInfo, sinon undefined
  async function entry(req: Request) {
    const h = req.headers.get("authorization")?.split(" ");
    const key = (h?.[0]?.toLowerCase() === "bearer" ? h[1] : undefined) ?? new URL(req.url).searchParams.get("key");
    if (key) {
      let found;
      try { found = await verifyKey(key); }
      catch (e) { console.error("mcp verifyKey", e); return Response.json({ jsonrpc: "2.0", error: { code: -32000, message: "Service temporairement indisponible" }, id: null }, { status: 503, headers: { "Retry-After": "5" } }); }
      if (found) {
        if (!rateLimit(`mcp:${found.keyId}`, 240, 60_000)) return Response.json({ jsonrpc: "2.0", error: { code: -32000, message: "Trop de requêtes" }, id: null }, { status: 429, headers: { "Retry-After": "60" } });
        verified.set(req, found);
      }
    }
    return authed(req);
  }
  export { entry as GET, entry as POST, entry as DELETE };
  ```
  Le 401 reste réservé aux clés absentes ou inconnues ; vérifier par un GET local sans clé. Option : limiter sur `hashKey(key)` avant `verifyKey`.
- **Verdict** : confirmé ; retirer seulement le `.catch(() => null)` ne suffit pas (withMcpAuth intercepte l'exception).

#### NEW-8 — « Annuler » après le retrait d'un favori : la date d'ajout et la place dans les listes, publiques comprises, sont perdues

- **Sévérité** : faible · **Effort** : M · **Vérification** : confirmé
- **Emplacement** : `src/components/favorites/favorites-provider.tsx:102-104,270,281-288,354-357` ; `src/lib/favorites.ts:81-86,118-121` ; `src/lib/collections.ts:107` ; `src/lib/collections-shared.ts:7` ; `src/app/api/favorites/route.ts:73-74`
- **Preuve** : le retrait supprime `favorites/{id}` (donc `addedAt`) et fait `arrayRemove` dans chaque liste ; seuls les identifiants des listes sont mémorisés (l.270). « Annuler » rappelle `toggle()`, qui recrée le favori avec `serverTimestamp()` et le repousse en fin de `favoriteIds`, puis `setInCollection()`, dont `arrayUnion` remet l'article en fin de tableau, alors que l'ordre des listes est présenté comme « Ordre manuel ».
- **Impact** : après « Annuler », l'article passe en tête de « Mes favoris » avec la date du jour et en dernière position de chacune de ses listes ; l'ordre d'une liste partagée publiquement (`/liste/[token]`) et des exports BibTeX change sans que l'utilisateur le voie ; sa pondération dans « Pour vous » change aussi. Pas de perte d'article.
- **Recommandation** :
  1. `removeFavorite` : dans la transaction, lire `addedAt`, l'index dans `favoriteIds` et l'index dans chaque liste ; les renvoyer dans la réponse du DELETE.
  2. `restoreFavorite(uid, snapshot, { addedAt, positions, favIndex })` : une transaction qui recrée le document avec `Timestamp.fromDate(new Date(addedAt))` (borné, validé), réinsère l'identifiant à `favIndex` (en respectant `MAX_FAVORITES`) et, pour chaque liste existante qui ne le contient pas, `splice(Math.min(index, len), 0, id)` puis `tx.update(ref, { articleIds })` ; exposée par `POST /api/favorites/restore` avec les gardes habituelles.
  3. Client : passer le JSON du DELETE à `restoreRef.current`, une seule requête de restauration, optimisme `withIdAt(c, id, index)`.
  Alternative (S) : ne réparer que l'ordre des listes (`index?: number` dans `addToCollection`, index connus côté client) ; la date exige le retour du serveur.
- **Verdict** : confirmé ; sévérité faible.

#### NEW-11 — « Bugs et idées » : le tri « Les plus votés » ne porte que sur les 300 sujets les plus récents

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : `src/lib/feedback.ts:26-29` ; `src/app/retours/page.tsx:20` ; `src/components/feedback/feedback-board.tsx:35,40-47`
- **Preuve** : `listFeedback()` fait `orderBy("createdAt", "desc").limit(300)` ; le tableau trie ensuite côté client par votes (tri par défaut) sur ces seuls 300 éléments, sans page de détail ni pagination. Les compteurs « Tous / Bugs / Idées » (l.47) sont aussi plafonnés. En production : 0 sujet. Publication limitée à 5 sujets par heure et par uid.
- **Impact** : au-delà de 300 sujets, les plus anciens (souvent les plus votés, « Prévu » ou « Fait ») disparaissent du tableau et ne peuvent plus recevoir de vote. Limite latente, sans effet aujourd'hui ; le scénario d'éviction par rafale relève de SEC-13/SEC-14.
- **Recommandation** (à faire avant ~200 sujets) : dans `feedback.ts`, deux requêtes en parallèle dédoublonnées :
  ```ts
  const [top, recent] = await Promise.all([
    col.orderBy("votes", "desc").limit(100).get(),
    col.orderBy("createdAt", "desc").limit(200).get(),
  ]);
  const byId = new Map<string, FeedbackItem>();
  for (const d of [...top.docs, ...recent.docs]) byId.set(d.id, toItem(d.id, d.data()));
  return [...byId.values()];
  ```
  (index automatique sur `votes`, pas d'index composite). Compteurs calculés avec `count()` (et un `where("kind", "==", …)`) ou « 300+ » quand la liste est tronquée. Option : exclure `declined` de la requête « récents ».
- **Verdict** : partiel. Mécanisme exact, impact nul aujourd'hui, compteurs faussés non relevés à l'origine.

#### NEW-13 — Dépôt public sans licence, alors que les mentions légales renvoient aux conditions « indiquées dans le dépôt »

- **Sévérité** : faible · **Effort** : S · **Vérification** : partiel
- **Emplacement** : racine du dépôt (aucun `LICENSE`) ; `package.json:4` (`"private": true`, pas de `license`) ; `src/app/mentions-legales/page.tsx:55-57` ; `src/app/conditions/page.tsx:52`
- **Preuve** : l'API GitHub pour LucasOtw/Sextant renvoie `private: false`, `license: null` ; `/repos/LucasOtw/Sextant/license` → 404 ; aucun `LICENSE*` ni `COPYING` (disque, `git ls-files`, `origin/main`). Les mentions légales, servies en production, disent que « les conditions de réutilisation du code sont celles indiquées dans le dépôt ». Les conditions ne couvrent que le nom, le logo et l'interface.
- **Impact** : par défaut, le code est « tous droits réservés » : aucune réutilisation légale hors de GitHub, et la page légale renvoie à des conditions inexistantes. Les conditions de GitHub permettent déjà de consulter, forker et contribuer par PR. Absence du champ `license` sans effet (paquet non publié).
- **Recommandation** (S) :
  - Option A, ouvrir le code : `LICENSE` à la racine (AGPL-3.0-only pour qu'un service dérivé publie ses modifications, ou MIT), champ `"license": "AGPL-3.0-only"` ou `"MIT"` dans `package.json`, `mentions-legales/page.tsx:56-57` : « …publié sur GitHub sous licence AGPL-3.0 (fichier LICENSE du dépôt). Cette licence ne couvre ni le nom ni le logo Sextant. », section « Licence » dans le README.
  - Option B, garder le code fermé : remplacer la phrase par « Le code source est consultable publiquement sur GitHub mais n'est pas placé sous licence libre : tous droits réservés, toute réutilisation nécessite l'accord de l'éditeur. » et, en option, `"license": "UNLICENSED"`.
- **Verdict** : partiel. Constat principal exact ; « personne ne peut contribuer » faux ; aucun impact de sécurité.

## 5. Points forts constatés

### Sécurité

- **Règles Firestore fermées et déployées** : l'API REST Firestore sans authentification renvoie 403 PERMISSION_DENIED sur `feedback`, `users`, `shares` et `apiKeys` ; aucun bucket Storage (404). Tout passe par le SDK Admin côté serveur.
- **Aucun IDOR** : chaque chemin Firestore est construit à partir de l'uid de session et d'identifiants validés par regex ; `revokeKey` vérifie le propriétaire en transaction (api-keys.ts:43-52). Les 6 routes privées testées renvoient 401 sans session.
- **Sessions solides** : cookie HttpOnly, Secure en production, SameSite=Lax ; `verifyIdToken(idToken, true)` exige une connexion de moins de 5 min (`auth_time`) et `verifySessionCookie(token, true)` contrôle la révocation (auth.ts:31, session/route.ts:30-34).
- **CSRF couvert** sur toutes les écritures authentifiées, y compris le « login CSRF » : `rejectCrossSite` (Sec-Fetch-Site, puis Origin comparé à Host, Origin `null` refusée) ; ni Server Actions ni en-tête CORS, même en réponse à OPTIONS.
- **Clés MCP bien conçues** : 256 bits aléatoires, seule l'empreinte SHA-256 est stockée, clé montrée une fois, 5 au maximum, révocation immédiate, suppression avec le compte ; 8 outils en lecture seule décrits par zod et annotés `readOnlyHint`.
- **Partage par lien** : jetons de 128 bits, jeton revérifié sur la liste, pages `/liste` en `noindex` et `no-referrer`, sans profil, notes ni citations ; le feedback public n'expose pas `authorUid`.
- **Entrées nettoyées et bornées** : `sanitizeSnapshot`, `sanitizeHighlightInput`, `cleanText` (longueurs en points de code), `rejectLargeBody` avant lecture, plafonds par utilisateur (1 000 favoris, 50 listes, 2 000 surlignages, 5 clés), compteurs en transaction.
- **Relais PDF prudent** : adresses issues d'OpenAlex et jamais du client, signature `%PDF` vérifiée avant tout envoi, `content-type: application/pdf` forcé, `nosniff`, 60 Mo maximum, délais par hébergeur et budget global, IP littérales et ports exotiques refusés.
- **Pas de XSS identifiée** : seul `dangerouslySetInnerHTML` = script de thème constant ; React 19 neutralise `javascript:` (y compris dans `<object data>`) ; DOI restreint à `https://doi.org/` ; tous les `target="_blank"` portent `rel="noreferrer"` ; avatars Google en `referrerPolicy="no-referrer"`.
- **Secrets maîtrisés** : aucun motif de secret dans les 86 commits ni dans les 21 chunks JS de production, aucun fichier sensible jamais suivi, `NEXT_PUBLIC_*` limitées à la config web Firebase, pas de source map publiée (voir toutefois l'alerte `AI_MODEL` en synthèse).
- **Plateforme** : HSTS de 2 ans avec `includeSubDomains` et `preload` ; aperçus et URL de déploiement protégés par Vercel Authentication ; `npm audit` sans vulnérabilité élevée ou critique, aucune dans les outils de dev.
- **PDF.js 6.3.289**, postérieur à CVE-2024-4367, sans `new Function` ni `isEvalSupported`, worker servi par le site et identique au paquet, ni couche d'annotations ni XFA.
- **RGPD** : export JSON et suppression récursive du compte (partages, clés, détachement des sujets publiés), suppression idempotente et rejouable.

### Performance

- **Desktop excellent** : 98 à 100 en performance, LCP de 0,4 à 0,6 s ; fil principal presque libre partout (TBT 0 à 38 ms hors lecteur), CLS nul sur toutes les pages mobiles.
- **Chargement à la demande là où il compte** : PDF.js (445 Kio) par `import()` et hors de tout First Load, worker hors fil principal ; annonce MCP en `next/dynamic` avec `ssr: false`.
- **Rendu PDF paresseux** : IntersectionObserver avec marge de 1 200 px, canevas libéré hors écran, densité de pixels plafonnée à 2 : mémoire bornée même sur 150 pages.
- **OpenAlex bien exploité** : appels groupés (`ids.openalex:W1|W2|…`, aucun N+1), champs `select` réduits, Data Cache avec des durées adaptées (600 s à 86 400 s, réponses 200 seulement), une seule relance sur 429/5xx.
- **Dédoublonnage des lectures** : `getCurrentUser` sous `React.cache`, `getWork` mémorisé entre `generateMetadata` et la page, cœur d'un favori lu en une lecture grâce à `favoriteIds`, compteurs par agrégations `count()`.
- **Cache au bord effectif** sur `/api/suggest`, `/api/author`, `/api/recommendations` et la sonde HEAD de `/api/pdf` (HIT mesurés) ; assets `/_next/static/immutable/*` en cache d'un an.
- **firebase-admin** chargé à la demande et en `serverExternalPackages` ; un visiteur sans cookie ne le charge jamais ; le client n'embarque pas le SDK Firestore.
- **Streaming** : `<Suspense key=…>` autour des résultats, de la sélection et des similaires ; lectures des pages de bibliothèque en `Promise.all`/`allSettled`.
- **Poids maîtrisés** : une seule police (next/font, 29 KiB), un seul CSS (17,6 KiB), HTML en brotli (accueil 14 Ko), polyfills en `noModule`, icônes lucide importées une à une, composants serveur partout où c'est possible.
- **Client réseau soigné** : FavoritesProvider dédoublonne ses requêtes, ignore les réponses périmées (`mutationSeq`) et limite le rechargement au focus ; SearchBox temporise (180 ms) avec `AbortController` ; AuthorChip ne charge le profil qu'au survol.
- **Aucune erreur d'hydratation** ; script de thème en ligne sans flash ; PageTransition n'anime pas le premier rendu (LCP préservé).

### Accessibilité

- **Structure saine** : `lang="fr"`, titres uniques et parlants (gabarit `%s · Sextant`), header, main, footer, `form role=search`, nav étiquetées, sections `aria-labelledby`, cartes en `<article>`, `aria-current` sur la navigation.
- **Axe sans violation** sur 6 pages sur 8 dans les deux thèmes ; aucune violation `image-alt`, `label`, `button-name`, `link-name` ni `target-size`.
- **Contrastes principaux conformes AA** dans les deux thèmes : texte secondaire 5,58 et 7,63:1, lien accent 6,53 et 8,53:1, badge accès ouvert 8,77:1, texte surligné ≥ 8,99:1.
- **Focus toujours visible** : 256 arrêts clavier sur 256 avec un indicateur et `:focus-visible` respecté (contraste à améliorer, A11Y-03).
- **Dialogues Base UI corrects** : focus piégé, focus initial sur l'action, reste de la page `inert`, titre relié, retour du focus au déclencheur ; 10 dialogues avec titre.
- **Contrôles sans texte nommés** : thème, favori (`aria-pressed`), votes (titre et nombre de votes), filtres en `role=group`, icônes décoratives masquées ; repères sr-only « Début / Fin du passage surligné ».
- **Régions live déjà présentes** : statut de « Ma note », compteurs, chargement du PDF, toasts sonner ; combobox de recherche proche du motif APG (`aria-activedescendant`, flèches, Échap).
- **Mouvement réduit** respecté sur la plupart des animations du site (une quinzaine en `motion-reduce:animate-none`), annulation proposée après la plupart des suppressions, confirmation pour la suppression de liste et de compte.

### Qualité

- **TypeScript strict** sans dette : `tsc --noEmit` et `eslint .` à 0 erreur, aucun `any` ni `@ts-ignore`, 10 `eslint-disable` tous justifiés.
- **Séparation serveur/client nette** : 12 modules en `import "server-only"`, convention `*-shared.ts` pour le code isomorphe (types, bornes, assainissement), aucun module de `lib/` n'importe `components/` ni `app/`.
- **Invariants tenus en transaction** (favoriteIds/favoritesCount, retrait en cascade, jeton ↔ liste, vote ↔ compteur), erreurs typées par domaine renvoyées en 404/409, réponses sans relecture.
- **Next 16 et React 19 bien utilisés** : `params`/`searchParams` attendus en `Promise`, `LayoutProps`, streaming, `revalidate` adapté à chaque donnée.
- **Gestion d'erreur exemplaire de la page de résultats** (distinction 429/panne, « Réessayer ») ; dégradation propre quand une clé manque (IA ou comptes masqués) ; messages `{ error }` en français et cohérents.
- **Documentation interne** : JSDoc en français qui explique le pourquoi ; `.env.example` complet et commenté (mais non versionné, QUAL-25).
- **Duplication globale faible** (1,66 % selon jscpd) ; versions critiques épinglées et `package-lock.json` commité.

## 6. Plan de correction

Estimations en jours-personne pour un développeur qui connaît le code, tests manuels compris. Chaque constat apparaît dans un seul lot (ou dans deux quand il se découpe en étapes).

### Lot 0 — Vérifications immédiates (≤ 1 h, avant tout le reste)

- Variable `AI_MODEL` de production (alerte de la synthèse) : si elle contient une clé, la remettre à `ministral-8b-latest`, redéployer et faire tourner la clé Mistral (ticket #9, connu).
- Plan Firebase de `sextant-ba71a` (Spark ou Blaze) et alerte de budget GCP ; en Spark, SEC-01 et SEC-07 passent en critique.
- Restauration à un instant donné (PITR) ou sauvegarde quotidienne Firestore (NEW-4, point 1).

### Lot 1 — Sécurité et coûts urgents (~1,5 j)

Fermer les routes anonymes coûteuses et rendre les refus lisibles.

- SEC-02 (garde et limite sur `/api/summary`), SEC-01 (points 1 à 3 : `cache()`, paquets parallèles, limite par IP), SEC-07 (lectures bornées dans le MCP, limite par uid, pages de bibliothèque limitées), NEW-3 et SEC-04 (règle de limitation de débit du pare-feu Vercel, limite sur le HEAD de `/api/pdf`), SEC-10 (supprimer `/api/health`), NEW-7 et QUAL-35 (429/503 au lieu de 401 dans le MCP).

### Lot 2 — Accessibilité mobile et clavier bloquante (~1,5 j)

Les deux constats élevés et les défauts qui touchent toutes les pages.

- A11Y-01, A11Y-02, A11Y-33, NEW-12 (débordement et zoom mobile) ; A11Y-03 (contraste du focus), A11Y-08 (`scroll-padding`) ; A11Y-10 et A11Y-09 (suggestions de recherche) ; A11Y-05 (fiche auteur au clavier).
- Contrôle de sortie : `scrollWidth <= clientWidth` à 320, 360 et 375 px, connecté et déconnecté.

### Lot 3 — Robustesse et pannes visibles (~2 j)

- QUAL-03 (`error.tsx`, `global-error.tsx`), QUAL-04 (journalisation serveur), QUAL-21 (erreurs du condensé), QUAL-01 (filtre « Toutes les sources »), NEW-1 (articles rétractés), NEW-5 (note d'article), QUAL-06 (`createdAt`), QUAL-09 (validation de `readRecent`), QUAL-07 (variables d'environnement), QUAL-33 (déconnexion), QUAL-37 (`lastUsedAt`), NEW-6 (repli de connexion), QUAL-36 (soft 404), QUAL-34 (sonde HEAD).

### Lot 4 — Gains de performance rapides (~2 j)

- PERF-04 (région `cdg1`, après vérification de la région Firestore), PERF-19 (CLS de la fiche), PERF-14 (« Pour vous » figé), PERF-28 (champs Années), PERF-26 (minuteurs orphelins et `memo`), PERF-27 (proportion des pages PDF), PERF-02 étape 1 (plus d'iframe Google pour les anonymes), PERF-18 (préchargements), PERF-03 (menu chargé à la demande), PERF-05 (`checkRevoked` réservé aux écritures), PERF-24 (Firestore en REST), PERF-20 (SDK Anthropic), PERF-21 (commentaire), PERF-25 (réponse allégée), PERF-23 (double lecture), PERF-22 (contexte de recherche sous Suspense), NEW-10 (icônes, manifeste, theme-color), PERF-16 et PERF-17 (cache et préchargement du lecteur).

### Lot 5 — Socle de tests et de CI (~5 j, connu)

À faire avant les lots 7 et 10.

- QUAL-19 (Vitest, ~60 tests unitaires, puis émulateur Firestore et Playwright), QUAL-20 (CI GitHub Actions, protection des branches), QUAL-43 (banc axe sur les aperçus Vercel, règles jsx-a11y), SEC-21 (`overrides` uuid, Dependabot), QUAL-27 (`@types/node` 24, `engines`), QUAL-26 (dépendances).

### Lot 6 — Sécurité en défense en profondeur (~2,5 j)

- SEC-03 (en-têtes, puis CSP à nonce en Report-Only), SEC-05 (SSRF du relais PDF, avec tests), SEC-06 (instantanés reconstruits côté serveur), SEC-08, SEC-09 et SEC-11 (révocation, ré-authentification, clés MCP), SEC-12 (IndexedDB), SEC-14 (votes), SEC-15 et SEC-16 (entrées OpenAlex), SEC-17 (taille des corps), SEC-19 (plafond des notes), SEC-22 (instructions MCP), NEW-4 (émulateurs et garde-fou de développement).

### Lot 7 — Performance structurelle (~4 j)

- PERF-01 (identité côté client, pages statiques mises en cache, `loading.tsx`), PERF-02 étape 2 (SDK Firebase Auth à la demande), PERF-06 (requêtes Range du lecteur PDF), PERF-07 (délais maximaux), PERF-08 (cache de `/retours`), PERF-09 (lectures parallèles de la fiche), PERF-10 (cascade des favoris), PERF-11 et PERF-12 (grandes bibliothèques), PERF-15 (condensés persistés), NEW-9 (écritures et index Firestore).

### Lot 8 — Accessibilité, suite (~3 j)

- A11Y-04, A11Y-06, A11Y-07, A11Y-11, A11Y-12, A11Y-13, A11Y-14, A11Y-15, A11Y-16, A11Y-17, A11Y-18, A11Y-19, A11Y-20, A11Y-21, A11Y-22, A11Y-23, A11Y-24, A11Y-25, A11Y-26, A11Y-27, A11Y-28, A11Y-29, A11Y-30, A11Y-31, A11Y-32, A11Y-34, A11Y-35, A11Y-36, A11Y-37, A11Y-38, A11Y-39, A11Y-40.
- Priorité interne : A11Y-12, A11Y-13, A11Y-04, A11Y-20, A11Y-22, A11Y-18, puis le reste.

### Lot 9 — Conformité, référencement et documentation (~2 j)

- NEW-2 (export RGPD complet), NEW-14 (durées de conservation), NEW-13 (licence), SEC-13 (signalement DSA), SEC-18 (« Pour vous » et politique), QUAL-42 (README et `AGENTS.md`), QUAL-25 (`.env.example`), QUAL-16, QUAL-17 et QUAL-18 (métadonnées, robots, sitemap, OpenGraph), NEW-11 (tri des retours).

### Lot 10 — Dette de code (~4,5 j, après le lot 5)

- QUAL-02 (module de citation unique, en premier), QUAL-08, QUAL-05 (garde commune des routes), QUAL-10 (client HTTP), QUAL-11, QUAL-12 (reducer des favoris), QUAL-13, QUAL-14 (identifiants), QUAL-15 (`server-only`), QUAL-22, QUAL-23 (module de compte), QUAL-24, QUAL-28, QUAL-29, QUAL-30, QUAL-31, QUAL-32, QUAL-38, QUAL-39, QUAL-40, QUAL-41, NEW-8 (restauration d'un favori).

### Estimation totale

| Lot | Contenu | Estimation |
|---|---|---|
| 0 | Vérifications immédiates | ≤ 1 h |
| 1 | Sécurité et coûts urgents | 1,5 j |
| 2 | Accessibilité mobile et clavier | 1,5 j |
| 3 | Robustesse | 2 j |
| 4 | Performance rapide | 2 j |
| 5 | Tests et CI (connu) | 5 j |
| 6 | Sécurité en profondeur | 2,5 j |
| 7 | Performance structurelle | 4 j |
| 8 | Accessibilité, suite | 3 j |
| 9 | Conformité, SEO, documentation | 2 j |
| 10 | Dette de code | 4,5 j |
| **Total** | 145 constats | **~28 jours-personne** |

Les lots 0 à 4 (~7 j) traitent tout ce qui est visible par les utilisateurs ou exposé aux abus. Répartition des efforts : 108 constats en S (< 1 h), 37 en M (< 1 j) ; le seul volet L est l'émulateur Firestore et Playwright de QUAL-19.

## 7. Annexe

### 7.1 Lighthouse 13.5.0 (production, 24/09, un passage par page, throttling simulé : 4G lente, CPU ×4 en mobile)

| Page | Profil | Perf | A11y | BP | SEO | FCP | LCP | TBT | CLS | SI | Poids | JS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Accueil | mobile | 65 | 100 | 100 | 100 | 4,6 s | 6,1 s | 38 ms | 0 | 5,4 s | 491 KiB | 422 KiB |
| Accueil | desktop | 100 | 100 | 100 | 100 | 0,3 s | 0,4 s | 0 ms | 0 | 0,6 s | 359 KiB | 289 KiB |
| Recherche « télétravail » | mobile | 66 | 96 | 100 | 100 | 4,3 s | 6,1 s | 0 ms | 0 | 5,0 s | 501 KiB | 431 KiB |
| Recherche « télétravail » | desktop | 100 | 96 | 100 | 100 | 0,4 s | 0,6 s | 0 ms | 0 | 0,6 s | 367 KiB | 298 KiB |
| Article W4406431707 | mobile | 68 | 100 | 96 | 90 | 4,5 s | 5,6 s | 0 ms | 0 | 4,5 s | 515 KiB | 430 KiB |
| Article W4406431707 | desktop | 98 | 100 | 96 | 90 | 0,3 s | 0,6 s | 0 ms | 0,095 | 0,7 s | 382 KiB | 296 KiB |
| Lecteur W2626778328/lire | mobile | 62 | 100 | 100 | 90 | 4,4 s | 16,4 s | 103 ms | 0,001 | 5,3 s | 2 786 KiB | 563 KiB |
| /retours | mobile | 95 | 100 | 100 | 100 | 1,2 s | 2,9 s | 13 ms | 0 | 2,7 s | 496 KiB | 434 KiB |
| /a-propos | mobile | 69 | 100 | 100 | 100 | 4,3 s | 5,4 s | 0 ms | 0 | 4,3 s | 472 KiB | 415 KiB |
| /theme/informatique | mobile | 64 | 96 | 100 | 100 | 4,9 s | 6,0 s | 0 ms | 0 | 5,6 s | 502 KiB | 431 KiB |
| /favoris (anonyme) | mobile | 66 | 100 | 100 | 100 | 4,4 s | 5,9 s | 0 ms | 0 | 5,1 s | 501 KiB | 440 KiB |
| Contrôle : accueil, Firebase/Google bloqués | mobile | 88 | 100 | 100 | 100 | 1,0 s | 3,5 s | 10 ms | 0 | 4,3 s | 356 KiB | 289 KiB |

- Passes avec la fenêtre d'accueil déjà fermée : A11y à 100 partout sauf `/search` 96 (contraste) et `/theme/informatique` 95 (contraste et ordre des titres) ; BP et SEO inchangés ; CLS de l'article desktop toujours à 0,095.
- L'écart de `/retours` (95) vient du démarrage de la chaîne Firebase après le premier affichage (1 561 ms, contre 584–794 ms ailleurs).
- Vérification de PERF-02 en bridage réel (`--throttling-method=devtools`, accueil, 2 passes) : avec Firebase 98/99 (FCP 1,59/1,52 s), domaines Google bloqués 98/98 (FCP 1,55/1,63 s).
- Vérification de PERF-19 : CLS 0,0987 à 1440×800, 0,045 à 1920×1080, **0,257 à 390×844** sans émulation tactile.

### 7.2 Temps de réponse et en-têtes (curl GET/HEAD en production)

| Mesure | Valeur |
|---|---|
| TTFB `/a-propos` | 1,43 s à froid, puis 0,25–0,30 s (attente serveur 143–167 ms contre 35–50 ms pour la CSS statique) |
| TTFB `/` | 315 ms à chaud, 1,69 s à froid |
| TTFB fiche article | 0,20–0,48 s (HTML 123 Ko) |
| TTFB `/retours` | 336–541 ms à chaud (médiane ~415 ms), 1,36 s à froid |
| TTFB `/search?q=climate change` | 229 ms (1,33 s au total, streamé) |
| `/api/recommendations` (graines inédites) | MISS, TTFB 0,64–0,80 s, 61–66 Ko de JSON (12,7 Ko en brotli) |
| `/article/W99999999999999999999999` | 200 en 10,7 s, erreur dans le flux (OpenAlex 504 en 9,2–9,3 s) |
| Cache des pages HTML et préchargements RSC | `private, no-cache, no-store`, `x-vercel-cache: MISS`, `x-vercel-id cdg1::iad1` |
| Région des fonctions / Node | iad1 / v24.20.0 |
| `/robots.txt`, `/sitemap.xml`, `/favicon.ico`, `/manifest.webmanifest` | 404 dynamique (`x-matched-path: /_not-found`) |

| En-tête | `/` | Fiche article | `/api/health` | `/liste/…` (404) | `/api/mcp` (401) |
|---|---|---|---|---|---|
| Content-Security-Policy | absent | absent | absent | absent | absent |
| Strict-Transport-Security | max-age=63072000; includeSubDomains; preload | idem | idem | idem | idem |
| X-Frame-Options / frame-ancestors | absent | absent | absent | absent | absent |
| X-Content-Type-Options | absent | absent | absent | absent | absent (présent sur `/api/pdf` seulement) |
| Referrer-Policy | absent (meta `no-referrer` sur `/liste` seulement) | absent | absent | absent | absent |
| Permissions-Policy / COOP | absent | absent | absent | absent | absent |
| x-powered-by | Next.js | Next.js | — | Next.js | — |
| cache-control | private, no-cache, no-store | idem | public, max-age=0, must-revalidate | private, no-store | public, max-age=0 |

Autres contrôles : 6 routes privées sur 6 en 401 sans session ; Firestore REST sans authentification en 403 PERMISSION_DENIED ; aucun `Access-Control-Allow-Origin` (OPTIONS en 204 sans ACAO) ; aperçus Vercel en 302 vers SSO ; `/.well-known/oauth-protected-resource` en 404.

### 7.3 Inventaire des 22 routes API (authentification / CSRF / débit / validation / taille)

| Route | Auth | CSRF | Débit | Validation | Taille |
|---|---|---|---|---|---|
| account/export GET | session | – | 5/min/uid | – | – |
| account/keys GET · POST | session | – · oui | aucun · 10/min | – · cleanText 40 | – · 4 Ko |
| account/keys/[id] DELETE | session | oui | aucun | regex sha256 | sans corps |
| auth/account DELETE | session | oui | aucun | pas de ré-authentification | – |
| auth/session POST · DELETE | idToken (checkRevoked, auth_time ≤ 5 min) · – | oui | aucun | – | aucune limite · ne révoque rien |
| author GET | public | – | aucun | regex A\d+ | – |
| collections GET·POST, [id] PATCH·DELETE, [id]/share | session | oui | 60/min | sanitize + regex | 16 Ko |
| collections/[id]/articles, favorites, highlights, highlights/[id], notes/[workId] | session | oui | 90/min | sanitize + WORK_ID | 16 à 32 Ko |
| feedback POST · feedback/[id]/vote | session | oui | 5/h · 60/min | sanitizeFeedback · regex | 16 Ko · sans corps |
| health GET | public | – | aucun | – | – (empreinte de configuration) |
| mcp GET·POST·DELETE | clé sxt_ (Bearer ou ?key=) | sans objet | 240/min/clé après vérification | zod | limite plateforme |
| pdf GET · HEAD | public | – | 30/min/IP · aucun | WORK_ID | 60 Mo |
| recommendations GET | public | – | 30/min/IP | PLAUSIBLE_ID | – |
| suggest GET | public | – | aucun | q ≥ 2, pas de maximum | – |
| summary POST | public | non | aucun | /^W\d+$/ | aucune limite |

### 7.4 Build et dépendances

`npx next build` (Next 16.3.6 Turbopack, compilation 0,7 s, TypeScript OK) : **37 routes ƒ, 1 seule ○** (`/icon.svg`) ; `prerender-manifest.json` ne contient que `/_global-error` et `/icon.svg`.

| Route | Type | First Load JS brut | gzip -9 |
|---|---|---|---|
| /favoris | ƒ | 943 Kio | 292 Kio |
| /citations | ƒ | 926 | 287 |
| /retours | ƒ (force-dynamic) | 924 | 286 |
| /search | ƒ | 918 | 284 |
| /theme/[slug] | ƒ (generateStaticParams sans effet) | 918 | 284 |
| /article/[id] | ƒ | 916 | 282 |
| /article/[id]/lire | ƒ | 904 (+ pdfjs 445 Kio / 131 gz à la demande, + worker 1,27 Mo) | 280 |
| / | ƒ | 892 | 275 |
| /compte | ƒ | 887 | 274 |
| /liste/[token] | ƒ (force-dynamic) | 882 | 272 |
| /a-propos, /conditions, /confidentialite, /mentions-legales, /_not-found | ƒ (contenu statique) | 875 | 269 |

Base commune : framework (react-dom, routeur, runtime) 430 Kio / 127 gz ; JS applicatif du layout 445 Kio / 142 gz.

| Chunk | Brut / gzip | Contenu |
|---|---|---|
| `2_scukb0kizd7.js` | 445 / 131 Kio | pdfjs-dist, à la demande |
| `37hjl69i7yox6.js` | 224 / 70 | react-dom |
| `0gvy95-hgt0ek.js` | 222 / 65 | Firebase Auth + sonner + Base UI Dialog/floating (layout) |
| `0ll4qwinak3w6.js` | 152 / 42 | routeur Next |
| `0cz1d0mv5g_q7.js` | 110 / 38 | polyfills `noModule` |
| `18jdgywms9v7a.css` | 84 / 16 | Tailwind |
| `3lr4iw3eg_w94.js` | 57 / 18 | Base UI Menu (layout) |
| `38jvfk93pp5lm.js` | 53 / 18 | code du layout (header, auth, favoris, accueil) |
| `322z80qutgjmy.js` | 46 / 17 | floating-ui positioner (layout) |
| `2y3boz1lbllj5.js` | 41 / 13 | composants de /article/[id] |

| Bibliothèque isolée (esbuild minifié) | Brut | gzip |
|---|---|---|
| firebase/app + auth (7 fonctions) | 125 Kio | 34 Kio |
| idem avec `initializeAuth` | 123 Kio | 33 Kio |
| sonner | 34 Kio | 10 Kio |
| @base-ui Menu | 160 Kio | 56 Kio |
| @base-ui Dialog | 76 Kio | 27 Kio |

JS téléchargé par page en production (brut / brotli) : socle (404) 553 / 147 Ko ; `/a-propos` 1 009 / 276 Ko ; `/` 1 027 / 282 Ko ; `/favoris` 1 079 / 297 Ko ; lecteur 1 039 / 286 Ko. Serveur : chaque fonction de page trace 9,8 Mo (dont 4,7 Mo de firebase-admin) ; `/api/summary` 2,1 Mo contre 1,8 Mo (SDK Anthropic).

Outils :
- `npm audit --omit=dev` : 8 modérées (un seul avis, GHSA-w5hq-g745-h8pq, uuid@9.0.1 via firebase-admin 13.10.0), 0 élevée ou critique sur 497 dépendances ; 0 dans les outils de dev ; correctif : firebase-admin 14.5.0 (majeure).
- knip : 3 fichiers inutilisés (`ui/card.tsx`, `ui/tooltip.tsx`, `lib/utils.ts`), 1 dépendance inutilisée (`next-themes`), 12 imports de `server-only` non déclaré, 37 exports inutilisés (23 dans les primitives shadcn), 9 types exportés inutilisés.
- depcheck : `next-themes` réellement inutilisé ; `shadcn` et `tw-animate-css` faux positifs partiels (imports CSS) ; `server-only` manquant.
- jscpd (min 8 lignes) : 129 fichiers, 11 446 lignes, 17 clones, 190 lignes (1,66 %) ; TypeScript seul : 13 clones, 152 lignes (4,30 %), surtout le boilerplate des routes API.
- madge : un cycle, `lib/favorites-shared.ts ↔ lib/format.ts`.
- Fermeture des dépendances de production : 609 paquets, dont 293 venant uniquement de la CLI shadcn.
- npm outdated : firebase-admin 13 → 14, typescript 5.9 → 7.0, eslint 9 → 10, `@types/node` 20 pour un runtime Node 24.
- Qualité statique : `eslint .` 0 problème (4,3 s), `tsc --noEmit --incremental false` 0 erreur (3,7 s), 10 `eslint-disable`, 0 `any`, 0 `@ts-ignore`, 53 casts `as` ; 0 test, pas de `.github/` ; 86 commits.

### 7.5 Accessibilité : axe-core, contrastes, clavier, reflow

axe-core 4.10.2 via Playwright 1.58 (Chromium headless, 1280×900), règles wcag2a/2aa/21a/21aa/22aa + best-practice, requêtes autres que GET/HEAD bloquées.

| Page | Clair | Sombre |
|---|---|---|
| / | 0 | 0 |
| /search?q=telétravail (0 résultat) | page-has-heading-one ×1 | idem |
| /search?q=télétravail (20 résultats) | page-has-heading-one ×1 | idem |
| /article/W4406431707 | 0 | 0 |
| /retours | 0 | 0 |
| /a-propos | 0 | 0 |
| /confidentialite | 0 | 0 |
| /liste/AAAA… (404) | 0 | 0 |
| /theme/informatique | color-contrast ×1, heading-order ×1 | heading-order ×1 |
| / avec fenêtre d'accueil | 0 (à revoir : aria-hidden-focus ×5, color-contrast ×4, vérifiés OK) | idem |
| /article avec fenêtre d'accueil | 0 (mêmes éléments à revoir) | idem |
| / avec annonce MCP | 0 (à revoir : aria-hidden-focus ×5, color-contrast ×2) | idem |
| / avec suggestions ouvertes (« climat ») | nested-interactive ×7 | idem |
| À revoir sur les 16 mesures de base | aria-valid-attr-value ×1 (aria-controls du combobox) | idem |

Contrastes calculés (OKLCH → OKLab → LMS → sRGB linéaire → gamma sRGB → luminance WCAG ; couleurs à alpha composées en sRGB) :

| Paire | Clair | Sombre |
|---|---|---|
| foreground / background | 17,50 | 18,96 |
| muted-foreground / background · card · muted · secondary | 5,58 · 6,00 · 5,26 · 5,03 | 7,63 · 6,91 · 5,83 · 5,63 |
| accent-brand / background · card | 6,53 · 7,02 | 8,53 · 7,72 |
| accent-brand-foreground / accent-brand | 6,63 | 8,47 |
| secondary-foreground / secondary | 11,44 | 10,83 |
| oa-foreground / oa (badge accès ouvert) | 8,77 | 8,75 |
| destructive / background | **4,43** | 6,84 |
| destructive / card | 4,76 | 6,19 |
| destructive / fond teinté destructive (10 % clair, 20 % sombre) | **3,72** (3,99 sur card) | 5,30 (4,63 sur card) |
| destructive / secondary (badge « Bug ») | **4,00** | 5,05 |
| blanc / accent-brand (vote actif) | 7,02 | **2,32** |
| foreground / surlignage `mark` | 16,24 | 8,99 |
| surlignage / carte (non-texte) | **1,16** | 1,91 |
| anneau `ring/50` / background | **1,82** | **2,05** |
| anneau `ring` plein / background | 3,72 | 4,97 |
| bordure `input` / background · card | **1,42 · 1,53** | **1,47** |
| texte du bouton inactif (opacity-50) | **3,48** (axe : 3,47) | 5,15 |

Clavier (4 parcours, accueil et fiche, clair et sombre) :
- 256 arrêts, tous avec indicateur visible et `:focus-visible`. En Maj+Tab, 6 arrêts entièrement masqués et 6 à moitié masqués par l'en-tête collant.
- Accueil : autofocus dans le champ, puis Rechercher → 4 requêtes suggérées → 16 cartes thème → Favori/titre en alternance ; l'en-tête n'est atteignable qu'en Maj+Tab.
- Fiche : logo → recherche → Recherche → thème → Se connecter → Médecine (7) → 5 auteurs → citations, DOI, Lire le PDF, éditeur, Citer, BibTeX, Enregistrer, Liste, Traduire (21).
- Tabulations avant le premier résultat : 29 sur `/theme` (35 selon une seconde mesure), 21 sur `/search` (14 selon une seconde mesure), 7 avant le contenu de la fiche.
- Fenêtre d'accueil : focus initial sur « Compris, je me lance », 6 Tab sur 6 dans la fenêtre, Échap sans effet (choix actuel). Annonce MCP : cycle de 3 arrêts, Échap ferme.

Structure et affichage :
- `lang="fr"` sur 8 pages sur 8 ; un h1 sur 7 pages sur 8 (`/search` : aucun) ; header, main, footer partout ; 2 nav étiquetées ; aucun lien d'évitement.
- Reflow (déconnecté) : `scrollWidth` de 436 px à 320, 360, 375, 390 et 414 px sur les 8 pages, confirmé en production à 375 px. Connecté : 388 px. Accueil avec historique à 375 px : `li` de « Pour vous » à 710 px, `scrollWidth` 726 px. `/search` à 320 px : aside à 391 px, `scrollWidth` 406 px (288 px avec `minmax(0,1fr)`).
- Tailles en px : 55 classes `text-[Npx]` dans 29 fichiers, dont 47 `text-[15px]`.
- Réduction des animations : 9 des 25 fichiers qui utilisent `animate-*` ont un repli `motion-reduce` ; `globals.css` ne neutralise que `.shimmer`.

### 7.6 Lectures Firestore par chargement complet, utilisateur connecté

N favoris ≤ 1 000, M listes ≤ 50, H surlignages ≤ 2 000, K articles d'une liste partagée ≤ 1 000.

| Page | Lectures | Appels Identity Toolkit (`getUser`) |
|---|---|---|
| `/`, pages légales | 1 (client `/api/favorites`) | 2 |
| `/article/[id]` | 3 (serveur) + 1 + M (client, `?collections=1`) | 2 |
| `/article/[id]/lire` | ≥ 2 | 2 |
| `/favoris` | N + 2M + 1 (jusqu'à ~1 101) | 2 |
| `/citations` | H + M + 1 (jusqu'à ~2 051) | 2 |
| `/compte` | ≥ 7 (dont `users/{uid}` lu 2 fois) | 3 |
| `/retours` | jusqu'à 300 + votes + 1 (anonyme : jusqu'à 300 ; 1 aujourd'hui, 0 sujet) | 2 |
| `/liste/[token]` (public) | 2 × (2 + K), jusqu'à 2 004 | 0 |
| MCP `get_my_citations` | 1 + H (jusqu'à 2 001) | 0 |

### 7.7 Micro-mesures complémentaires

| Mesure | Résultat |
|---|---|
| Filtre de `/citations`, 2 000 éléments (Node, puce M) | 23,5 ms par frappe (relecteur) ; 76 ms au pire cas, 10 ms en réaliste (vérification) ; 0,5–0,6 ms avec index pré-plié |
| Filtre des favoris (1 000) | 2,5–3,3 ms ; filtre de liste par `includes()` 1,27 ms contre 0,08 ms avec un Set |
| Taille JSON de `/citations` | 11,8 Mo au pire cas, 2,8 Mo réaliste (2 000), 0,28 Mo (200) |
| Chargement des modules serveur | `firebase-admin/auth` 88 ms ; `firebase-admin/firestore` 54 ms ; client Firestore gRPC 116–124 ms contre REST 76–82 ms (203 ms à froid) |
| OpenAlex en direct | recherche de 20 résultats 243 Ko en 1,66 s à froid ; fiche détaillée 27 Ko en 0,41 s |
| Sélection au défilement du lecteur (54 pages, 240 frames) | ~0,4 ms/frame ; 1,6–2,2 ms/frame CPU ×4 |
| Proportion des pages PDF (W2124637492) | page rendue 1 009,4 px, non rendue 1 102,9 px ; premier saut vers la page 30 à −2 525 px |
| Filtre « sources » (`/search?q=microbiome`) | 407 005 résultats sans paramètre, 517 991 avec `src=all` |
| Revalidation du worker PDF.js | 304 en 0,117 s |

### 7.8 Constats réfutés

| ID | Titre | Raison du rejet |
|---|---|---|
| SEC-20 | PDF.js : `isEvalSupported` laissé à true pour des PDF tiers | L'option n'existe plus dans pdfjs-dist 6.3.289 installé : aucun `eval` ni `new Function`, les fonctions PostScript passent par WebAssembly ou un interpréteur. |
| PERF-13 | Export RGPD construit en mémoire, risque de dépasser la limite de réponse de Vercel | Les fonctions Node.js de Vercel sont diffusées en streaming par défaut, donc sans plafond de 4,5 Mo ; un compte lourd réaliste produit ~4 Mo (le vrai défaut voisin, notes non plafonnées et export tronqué, est SEC-19). |
