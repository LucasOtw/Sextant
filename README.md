# Sextant

Porte d'entrée vers la littérature scientifique : recherche par mots-clés, thématiques, sélection,
page article avec métadonnées claires, accès au PDF légal, résumé IA optionnel et articles similaires.
Pas de compte, pas de base de données : tout vient d'[OpenAlex](https://docs.openalex.org) à la volée.

## Stack

- Next.js 16 (App Router, Server Components, streaming) · React 19 · TypeScript
- Tailwind CSS 4 + [shadcn/ui](https://ui.shadcn.com) (style `base-nova`, icônes Lucide)
- Données : API OpenAlex (gratuite, sans clé, CC0)
- Résumé IA : fournisseurs gratuits à modèles ouverts (Mistral par défaut, Groq, OpenRouter) via l'API « chat/completions », ou Anthropic ; activé seulement si une clé est définie (voir `.env.example`)

## Démarrage

```bash
npm install
cp .env.example .env.local   # puis renseigner OPENALEX_MAILTO et, si voulu, une clé IA (MISTRAL_API_KEY…)
npm run dev
```

Ouvrir <http://localhost:3000>.

## Pages

| Route | Rôle |
|---|---|
| `/` | Recherche, grille des 16 thématiques, sélection du moment (récents · accès ouvert · revues indexées · les plus cités) |
| `/search?q=…` | Résultats, filtres (tri, type, accès ouvert, années), pagination. Aussi `topic=T…` (sujet) et `cites=W…` (articles citant) |
| `/theme/[slug]` | Une thématique (= un *field* OpenAlex) : sous-thèmes cliquables + résultats filtrés |
| `/article/[id]` | Fiche article (`W…`) : métadonnées, résumé, résumé IA, PDF / éditeur, citation APA & BibTeX, sujets, articles similaires |
| `POST /api/summary` | Génère le résumé IA (`{ id: "W…" }`), mis en cache en mémoire |
| `GET /api/suggest?q=` | Suggestions de la barre de recherche (autocomplete OpenAlex re-trié par citations) |

## Organisation

```
src/
  app/            pages (App Router) + route API
  components/     composants métier (WorkCard, SearchFilters, Results…) et ui/ (shadcn)
  lib/openalex.ts client OpenAlex typé (recherche, article, similaires, sujets)
  lib/format.ts   reconstruction du résumé, auteurs, APA/BibTeX, libellés FR
  lib/themes.ts   les 16 thématiques mises en avant (slug → field OpenAlex)
  lib/ai.ts       fournisseurs de résumé IA (Mistral / Groq / OpenRouter / Anthropic)
  lib/recent.ts   historique local « Consultés récemment »
```

## Nom

Un **sextant** trouve des sources. Le logo est sa baguette (le Y) pointée vers la source (le point bleu).

## Choix

- **Qualité des sources** : seuls les documents « vérifiés » sont servis — articles et revues de littérature
  (évalués par les pairs), thèses, livres et chapitres (`type:article|review|book|book-chapter|dissertation`).
  Préprints, éditoriaux, lettres, errata, rapports et jeux de données sont exclus. Par défaut, les résultats se
  limitent aux revues indexées (`primary_location.source.is_core:true`, liste proche de Scopus / Web of Science) ;
  le filtre « Sources » permet d'élargir, et les thèses en sont exemptées (hébergées hors revues). Paratextes et
  rétractés sont toujours exclus, les rétractations signalées sur la fiche. Les suggestions de la barre de
  recherche suivent les mêmes règles.
- **Similaires** : `related_works` d'OpenAlex, complété par les articles les plus cités du même sujet si besoin.
- **PDF** : jamais hébergé. On pointe vers `best_oa_location.pdf_url`, sinon l'URL OA, sinon l'éditeur (DOI).
- **IA** : aide à la lecture, pas de substitution — la synthèse est générée à la demande, signalée comme telle,
  et la page reste complète sans elle.

## Déploiement

Compatible Vercel sans configuration. Définir les variables d'environnement de `.env.example`.
