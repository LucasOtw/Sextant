# Lot 6 — Sécurité en défense en profondeur (branche `lot-6`)

Suite de l'audit du 24/09 (`2026-09-24-audit-complet.md`, section « Lot 6 »). Le détail de chaque correctif est dans les messages de commit de la branche.

## Points de vigilance

- Sessions (SEC-08) : chaque requête compare l'`auth_time` du cookie à la dernière révocation des jetons, mémorisée 5 minutes par uid et par instance (`src/lib/account-state.ts`, partagé avec les clés MCP). Après « Se déconnecter de tous les appareils », un cookie copié ne lit ni n'écrit plus rien, au plus 5 minutes après. Firebase Auth injoignable : lectures servies, écritures refusées.
- Instantanés d'article (SEC-06) : favoris, listes, notes et surlignages sont reconstruits depuis OpenAlex. OpenAlex en panne : l'instantané du client, nettoyé, est gardé (panne journalisée).
- CSP à nonce posée en `Content-Security-Policy-Report-Only` (`src/proxy.ts`) : rien n'est bloqué pour l'instant.

## À faire par le propriétaire

1. **Sauvegarde Firestore** (projet `sextant-ba71a`, NEW-4) : activer la restauration à un instant donné,
   `gcloud firestore databases update --database='(default)' --enable-pitr`, ou programmer une sauvegarde quotidienne,
   `gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=7d`.
2. **Vercel > Settings > Environment Variables** : réserver `FIREBASE_SERVICE_ACCOUNT` à l'environnement Production (pas Preview ni Development). **Vercel > Settings > Git** : vérifier que Git Fork Protection est activé (dépôt public). **Vercel > Settings > Deployment Protection** : vérifier la protection des aperçus.
3. **Console Firebase > Authentication > Sign-in method** : vérifier que Google est le seul fournisseur activé (SEC-14). Le serveur refuse déjà toute autre connexion, c'est une défense en profondeur.
4. **CSP** : après quelques jours de rapports `/api/csp-report` sans surprise dans les journaux Vercel, passer l'en-tête de `src/proxy.ts` de `Content-Security-Policy-Report-Only` à `Content-Security-Policy`.
5. **COOP** : tester la connexion Google (fenêtre surgissante) sur un déploiement d'aperçu avec `Cross-Origin-Opener-Policy: same-origin-allow-popups`, avant de l'ajouter aux en-têtes de `next.config.ts`.
