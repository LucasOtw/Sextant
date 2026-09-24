# Lot 1 — Sécurité et coûts urgents (branche `lot-1`)

Suite de l'audit du 24/09 (`2026-09-24-audit-complet.md`, section « Lot 1 »).

## Ce que fait le code

- `/api/summary` : contrôle d'origine, corps borné, `application/json` exigé, limite de 10 appels/min par IP (SEC-02). Un `AI_MODEL` qui ressemble à une clé est ignoré et jamais affiché ; sans `AI_MODEL` valide, le repli Anthropic est `claude-haiku-4-5` (plus de repli sur le modèle le plus cher).
- `/liste/[token]` : une seule lecture par rendu (`cache()`), paquets `getAll` en parallèle, 120 vues/min par IP (SEC-01). `/retours` : 120 vues/min par IP.
- `/favoris` et `/citations` : 30 rendus/min par compte (seau `page-lib`).
- Outils MCP : lectures bornées ; sans filtre, les `n` plus récents ; avec filtre texte, parcours plafonné à 600 éléments (`MCP_SCAN_MAX`), signalé dans la réponse. Limite de 90 appels/min par compte et 300/min par IP ; 429/503 au lieu de 401 (NEW-7, QUAL-35).
- `GET /api/highlights` et `GET /api/favorites?full=1` supprimés : aucun appelant, et ils lisaient toute la bibliothèque (SEC-07, point 6).
- HEAD `/api/pdf` (60/min), `/api/suggest` et `/api/author` (120/min) limités par IP (SEC-04). Le bouton « Lire le PDF » et la carte d'auteur ne prennent plus un 429 pour un échec définitif.
- `/api/health` supprimé (SEC-10).

Toutes ces limites sont **en mémoire, par instance** : elles bornent une boucle depuis un poste, pas une attaque répartie ni plusieurs instances. La borne globale est la règle du pare-feu Vercel ci-dessous.

## À faire par le propriétaire

1. **Vercel > Firewall > Rate Limiting** (par IP, action 429, d'abord en mode « log » quelques jours pour caler les seuils) :
   - `/api/pdf` : ≈ 20 requêtes / 60 s ;
   - `/api/summary` : ≈ 10 / 60 s ;
   - `/liste/*` et `/retours` : ≈ 120 / 60 s ;
   - `/api/mcp` : ≈ 120 / 60 s ;
   - `/api/suggest` et `/api/author` : ≈ 120 / 60 s.
2. **Vercel > Settings > Environment Variables** : ouvrir `AI_MODEL` en production. Si c'est une clé (préfixe `mstrl_`), la remplacer par `ministral-8b-latest` (ou supprimer la variable), redéployer, puis **faire tourner la clé Mistral** dans la console Mistral et mettre la nouvelle dans la bonne variable (ticket #9). Le code n'affiche plus la valeur, mais la clé déjà publiée sur les fiches article reste valide tant qu'elle n'est pas révoquée.
3. **Firebase `sextant-ba71a`** : vérifier le forfait (Spark ou Blaze) ; en Blaze, poser une alerte de budget GCP (Facturation > Budgets et alertes) avec seuils 50 / 90 / 100 %. En Spark, SEC-01 et SEC-07 passent en critique (quota de lectures quotidien partagé par tous les utilisateurs).
4. **Vercel > Settings > Billing / Usage** : activer les notifications d'usage (Fast Data Transfer, Function Invocations, Function Duration) pour repérer un abus du relais PDF.
