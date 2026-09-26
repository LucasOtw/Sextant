/**
 * Robots servis en rendu bloquant (option `htmlLimitedBots` de next.config.ts) : ils reçoivent le titre, la description
 * et les balises de partage dans le `<head>`, au lieu de les voir arriver plus tard dans le `<body>` avec le flux
 * (métadonnées « streamées » de Next 16, QUAL-16). Les fiches article en dépendent : leurs métadonnées attendent OpenAlex.
 *
 * `htmlLimitedBots` REMPLACE la liste de Next au lieu de la compléter : on en reprend donc une copie, à laquelle on
 * ajoute Googlebot (que Next classe comme robot capable d'exécuter le JavaScript et sert en flux). Copie de
 * `node_modules/next/dist/shared/lib/router/utils/html-bots.js` (Next 16.3.6), sans importer ce chemin interne ;
 * tests/unit/seo.test.ts échoue si une mise à jour de Next change la liste : reporter alors la nouvelle ici.
 * Contrepartie assumée : Googlebot attend la fin de `generateMetadata` (lecture OpenAlex, en cache) avant le premier octet.
 */
export const NEXT_HTML_LIMITED_BOTS =
  "[\\w-]+-Google|Google-[\\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight";

/** Liste de Next + Googlebot (et ses variantes `Googlebot-Image`, `Googlebot-News`…). */
export const HTML_LIMITED_BOTS = new RegExp(`${NEXT_HTML_LIMITED_BOTS}|Googlebot`, "i");
