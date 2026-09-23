<div align="center">

<img src="docs/logo.svg" width="96" alt="Logo Sextant : un sextant dont l'alidade vise une étoile" />

# Sextant

**Trouvez votre cap dans la littérature scientifique.**

Un moteur de recherche et de découverte d'articles scientifiques, simple et soigné.<br/>
Pour les étudiant·es, les doctorant·es, et toutes les personnes curieuses.

🌐 **[Voir le site en ligne](https://sextant-psi.vercel.app/)** &nbsp;·&nbsp; 🐙 [Code source](https://github.com/lucas-tomexplore/Sextant) &nbsp;·&nbsp; 🗺️ [Feuille de route](#️-feuille-de-route)

<img src="docs/screenshots/01-accueil.png" width="880" alt="Page d'accueil de Sextant" />

</div>

<br/>

## 🧭 Le projet en une phrase

Vous tapez quelques mots-clés, Sextant remonte des articles **évalués par les pairs**, des **thèses** et des **ouvrages universitaires**, avec des informations claires (auteurs, revue, année, citations), l'accès au **PDF quand il est libre**, et pour chaque article des **pistes pour continuer**. Pas de compte, pas de bruit, pas de presse.

> 🤝 **Un compagnon, pas un raccourci.** Sextant complète vos recherches sur Google Scholar, les bases de votre discipline et votre bibliothèque. Il ne les remplace pas.

<br/>

## ✨ Ce que vous pouvez faire

### 🔍 Chercher, et être guidé dès la frappe

Des suggestions apparaissent pendant que vous tapez : articles les plus cités correspondant à vos mots, thématiques proches. Entrée, et vous y êtes.

<img src="docs/screenshots/02-recherche.png" width="880" alt="Résultats de recherche avec filtres" />

- 🎚️ **Filtres** : tri (pertinence, citations, date), type de document, sources, langue, accès ouvert, années.
- 🇫🇷 **Langue** : le filtre « Français » fait remonter la recherche francophone, souvent noyée ailleurs.
- 🧩 **Sous-thèmes** : depuis une thématique, des puces cliquables pour affiner sans réfléchir aux mots-clés.

### 📄 Une fiche article lisible

<img src="docs/screenshots/03-article.png" width="880" alt="Fiche d'un article : auteurs, revue, citations, PDF, résumé" />

- 📥 **Lire le PDF** quand une version libre existe, sinon **Voir chez l'éditeur**.
- 📋 **Citer** en un clic : APA ou BibTeX dans le presse-papiers.
- 👤 **Auteurs** : survolez un nom pour voir son institution (avec lien vers le site), ses articles, ses citations, son indice h, son ORCID.
- 🔗 **Pour aller plus loin** : les articles proches par le contenu, pour rebondir de lecture en lecture.
- 🧠 **L'essentiel en quatre points** : un condensé du résumé, traduit en français si besoin (voir plus bas).

### 🗂️ Explorer par thématique

Seize grands domaines, de l'informatique aux arts et humanités. Chaque thématique montre ses sous-thèmes les plus actifs et les articles récents les plus cités.

<img src="docs/screenshots/04-theme.png" width="880" alt="Page thématique Neurosciences" />

### 🌙 Confortable, de jour comme de nuit

Mode sombre en un clic, mémorisé. Historique local « Consultés récemment » pour reprendre où vous en étiez. Transitions douces, jamais tape-à-l'œil.

<img src="docs/screenshots/05-accueil-sombre.png" width="880" alt="Page d'accueil en mode sombre" />

<br/>

## 🎯 Comment les articles sont choisis

La qualité passe avant la quantité. Sextant s'appuie sur [OpenAlex](https://openalex.org), la plus grande base bibliographique ouverte au monde, et n'en garde que le fiable :

| ✅ Ce qui remonte | ❌ Ce qui est écarté |
|---|---|
| Articles et revues de littérature évalués par les pairs | Préprints, éditoriaux, lettres, errata |
| Thèses de doctorat | Rapports, jeux de données, notices de couverture |
| Livres et chapitres universitaires | Documents rétractés |
| Par défaut, revues **indexées** (liste proche de Scopus / Web of Science) | Le filtre « Sources » permet d'élargir si besoin |

Les suggestions de la barre de recherche et les articles similaires suivent les mêmes règles.

<br/>

## 🧠 Le condensé par IA

Sur une fiche, un bouton condense le résumé original en quatre points : **question, méthode, résultat, portée**. En français, traduit si l'article ne l'est pas.

- 🇪🇺 Généré par un **modèle ouvert de [Mistral AI](https://mistral.ai)**, hébergé en Europe.
- 🏷️ Toujours signé : le fournisseur et le modèle sont affichés à côté du texte.
- 🧾 Toujours indicatif : la source fait foi. Lisez l'article, pas seulement sa synthèse.

<br/>

## 🔒 Vie privée

- Aucun compte, aucun cookie de suivi, aucune mesure d'audience, aucune publicité.
- Le mode d'affichage, le message d'accueil lu et l'historique de consultation restent **dans votre navigateur**.
- Seuls vos mots-clés partent vers OpenAlex, et seul le résumé public d'un article part vers Mistral, quand vous le demandez.

Détails : [Confidentialité](src/app/confidentialite/page.tsx) · [Conditions d'utilisation](src/app/conditions/page.tsx) · [À propos](src/app/a-propos/page.tsx)

<br/>

## 🗺️ Feuille de route

- [x] Recherche, filtres, thématiques, fiche article, similaires
- [x] Condensé par IA (Mistral)
- [x] Carte auteur au survol
- [x] Mode sombre, historique local, pages légales
- [ ] Comptes utilisateurs et listes de lecture
- [ ] Serveur MCP : brancher sa bibliothèque Sextant à Claude ou ChatGPT ([note](docs/handoffs/2026-09-22-idee-mcp-sextant.md))
- [ ] Alertes sur un sujet ou un auteur
- [ ] Applications mobiles (après la version web)

<br/>

<details>
<summary><strong>🛠️ Sous le capot</strong> — pour celles et ceux qui veulent faire tourner ou contribuer</summary>

<br/>

**Stack** : Next.js 16 (App Router, Server Components) · React 19 · TypeScript · Tailwind CSS 4 · [shadcn/ui](https://ui.shadcn.com) · icônes Lucide.
**Données** : API OpenAlex (gratuite, sans clé, CC0). **IA** : API Mistral (offre gratuite), Groq / OpenRouter / Anthropic possibles.
**Hébergement** : Vercel.

### Démarrer

```bash
npm install
cp .env.example .env.local   # OPENALEX_API_KEY (clé gratuite, évite les limites anonymes) ; MISTRAL_API_KEY pour le condensé
npm run dev                  # http://localhost:3000
```

### Pages et API

| Route | Rôle |
|---|---|
| `/` | Recherche, thématiques, sélection du moment, consultés récemment |
| `/search?q=…` | Résultats et filtres ; aussi `topic=`, `cites=`, `author=`, `lang=`, `type=`, `src=all` |
| `/theme/[slug]` | Une thématique : sous-thèmes + résultats |
| `/article/[id]` | Fiche article (identifiant OpenAlex `W…`) |
| `/a-propos`, `/conditions`, `/confidentialite` | Pages de texte |
| `GET /api/suggest?q=` | Suggestions de la barre de recherche |
| `GET /api/author?id=` | Profil court d'un auteur |
| `POST /api/summary` | Condensé par IA `{ id: "W…" }`, mis en cache |

### Organisation

```
src/
  app/            pages (App Router) + routes API
  components/     composants métier et ui/ (shadcn)
  lib/openalex.ts client OpenAlex typé (recherche, article, similaires, sujets, auteurs)
  lib/ai.ts       fournisseurs du condensé (Mistral par défaut)
  lib/format.ts   résumé, auteurs, APA / BibTeX, libellés
  lib/themes.ts   les 16 thématiques (slug → field OpenAlex)
  lib/recent.ts   historique local
docs/             logo, captures d'écran
```

### Branches

- `main` : version en ligne, ne reçoit que des merges depuis `dev`.
- `dev` : intégration ; les fonctionnalités arrivent par `feat/<nom>` et pull request vers `dev`.

### Variables d'environnement

Voir [`.env.example`](.env.example). Sans clé IA, le bouton de condensé est simplement masqué.

</details>

<br/>

<div align="center">

Un **sextant** sert à faire le point et à tenir son cap. 🧭

</div>
