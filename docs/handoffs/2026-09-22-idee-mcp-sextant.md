# Idée : un serveur MCP Sextant (brainstorm du 22/09/2026, à reprendre plus tard)

**Statut : idée enregistrée, rien à développer pour l'instant.** Dépend de la fonctionnalité « comptes + collections » qui n'existe pas encore.

## L'idée

Quand Sextant aura des comptes, des favoris, des collections et des notes, exposer ces données via un **serveur MCP** (Model Context Protocol)
que l'utilisateur connecte à Claude, ChatGPT ou tout autre assistant. L'assistant peut alors lire *sa* bibliothèque et l'aider :

- « Analyse ma collection *Haptique* et dégage les tendances de recherche. »
- « Parmi mes 47 articles sauvegardés, lesquels construisent le mieux mon état de l'art sur X ? »
- « Compare les conclusions de ces cinq articles et dis-moi où les auteurs sont en désaccord. »
- « Quels sujets reviennent dans mes articles mais semblent peu étudiés ? »

Positionnement : **Sextant Web** (je découvre et j'organise) + **Sextant MCP** (je donne ma littérature à mon IA). La même API pourrait
alimenter plus tard un « Ask Sextant » dans le site et une app mobile.

## Outils MCP envisagés

Lecture (v1) :
`search_articles(query, filters)` · `get_article(id)` · `get_related_articles(id)` · `get_my_favorites()` · `list_collections()` ·
`get_collection(id)` · `get_my_notes(article_id)` · `get_reading_history()`

Écriture (v2) :
`add_to_collection(article_id, collection_id)` · `add_note(article_id, note)` · `mark_as_read(article_id)`

On expose métadonnées, résumés, notes et liens — pas les PDF. Le texte intégral, plus tard, seulement quand il est légalement libre.

## Points d'attention (avis Claude)

1. **Authentification = le vrai sujet.** Un MCP distant connecté à Claude ou ChatGPT passe par **OAuth 2.1** (le protocole MCP le
   spécifie : découverte des métadonnées du serveur d'autorisation, PKCE, enregistrement dynamique de client). Le compte Sextant doit
   donc être conçu comme un fournisseur OAuth, ou s'appuyer sur un service qui le fait (Auth.js, Clerk, Supabase Auth…). Chaque appel
   d'outil porte le jeton de l'utilisateur et ne renvoie que ses données. Jamais de clé partagée.
2. **Concevoir le modèle de données maintenant** en gardant l'identifiant OpenAlex (`W…`) comme clé d'article partout : favoris,
   collections, notes, historique. Le MCP réutilisera `lib/openalex.ts` tel quel pour enrichir.
3. **Une seule API, deux façades.** Les routes REST du site et les outils MCP doivent appeler les mêmes fonctions métier ; le serveur MCP
   n'est qu'une couche fine (SDK TypeScript officiel `@modelcontextprotocol/sdk`, transport HTTP streamable, hébergeable sur Vercel à
   côté du site).
4. **Garde-fous** : quotas par utilisateur (les assistants peuvent appeler un outil des dizaines de fois par conversation), pagination
   sur les collections volumineuses, résumés courts par défaut et texte complet à la demande pour ne pas saturer le contexte.
5. **Découvrabilité côté ChatGPT** : OpenAI accepte les connecteurs MCP personnalisés et propose son Apps SDK bâti sur MCP ; côté
   Claude, connecteurs distants dans claude.ai et Claude Code. Un seul serveur sert les deux.
6. **Ce que ça change pour le plan produit** : comptes → collections/notes → API → MCP. Le MCP est la 4e brique ; ne pas commencer par lui.

## Ordre de grandeur

Une fois les comptes et collections en place, un MCP lecture seule tient en quelques jours : les outils sont des enveloppes autour de
fonctions existantes, l'essentiel du travail est l'OAuth.
