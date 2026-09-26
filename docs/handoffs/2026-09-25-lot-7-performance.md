# Lot 7 — Performance structurelle (branche `lot-7`)

Suite de l'audit du 24/09 (`2026-09-24-audit-complet.md`, section « Lot 7 »). Le détail de chaque correctif est dans les messages de commit de la branche.

## Points de vigilance

- Identité côté client (PERF-01) : le layout ne lit plus la session. L'accueil (ISR 600 s) et les pages légales (`/a-propos`, `/conditions`, `/confidentialite`, `/mentions-legales`) sont prérendus et mis en cache au bord, identiques pour tous. L'en-tête apprend qui est connecté par la réponse de `GET /api/favorites` ; l'indice `sextant_signed_in` (sans donnée) lui dit avant l'hydratation s'il y a une session.
- Indice de connexion : `1` = session ouverte ; `0` = cookie de session refusé (expiré, révoqué), pour une heure. Une panne de la vérification (SDK Admin, réseau, certificats) ne le marque pas : `GET /api/favorites` répond 503 et le client relance une fois quelques secondes après. Le proxy pose l'indice manquant d'une session ouverte avant son introduction, y compris sur les pages en cache (seconde entrée du `matcher`, qui ne s'applique qu'avec un cookie de session et sans indice).
- Accueil : un échec d'OpenAlex au moment d'une régénération est relancé, pour que Next garde la dernière page réussie. Au build, le repli « La sélection est momentanément indisponible. » est prérendu tel quel jusqu'à la régénération suivante (10 minutes au plus).
- Lecteur PDF en mode plages (PERF-06, fichiers de 2 Mo et plus) : si le téléchargement complet se coupe après l'ouverture du document, un message invite à recharger la page ou à ouvrir le PDF original.

## Vérifications manuelles

- Lecteur PDF : ouvrir `/article/W4405561638/lire`, couper le réseau (outils de développement, « Offline ») juste après l'affichage de la première page, puis faire défiler : les pages déjà lues restent affichées et le message « Le téléchargement du PDF s'est interrompu » apparaît.
- Connecté, supprimer le cookie `sextant_signed_in` dans les outils de développement, puis recharger `/` : l'indice est reposé à `1` et l'en-tête montre le compte sans passer par une page dynamique.

## À faire par le propriétaire

1. **Index Firestore** (projet `sextant-ba71a`, NEW-9) : `firebase.json` déclare désormais `firestore.indexes.json`, qu'un `firebase deploy` complet appliquerait. Ce fichier ne contient aucun index composite (`"indexes": []`) et désactive l'indexation de champs jamais interrogés. Avant tout déploiement : `firebase firestore:indexes --project sextant-ba71a`, ajouter au fichier tout index créé depuis la console, puis `firebase deploy --only firestore:indexes --project sextant-ba71a` (refuser la suppression des index absents du fichier si la question est posée et qu'un doute subsiste).
2. **Cache au bord en production** (PERF-01, point 2) : après la mise en ligne, `curl -sI https://sextant-psi.vercel.app/` puis `/a-propos`, `/conditions`, `/confidentialite`, `/mentions-legales` (deux fois chacune) : on attend `x-vercel-cache: HIT` à la seconde requête et un `cache-control` public, sans `private` ni `no-store`.
3. **CSP des pages en cache** : ces pages ne peuvent pas recevoir de nonce ; leur politique (`next.config.ts`, `STATIC_PAGE_CSP`) admet les scripts en ligne (`'unsafe-inline'`). À trancher avant le passage de la CSP en mode bloquant (lot 6, point 4) : garder ce compromis (pages sans contenu venu d'un utilisateur), ou renoncer à la mise en cache de ces pages.
4. **Plan Firebase** (PERF-08, point 5) : vérifier dans la console Firebase (Utilisation et facturation) que le projet est en plan Blaze. En plan Spark, les quotas de lectures quotidiens s'appliquent aux condensés IA gardés (`aiSummaries`) et à la liste de `/retours`.
