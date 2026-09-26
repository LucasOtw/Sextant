import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/**
 * /robots.txt prérendu en statique (au lieu d'un 404 rendu à chaque passage de robot), avec l'adresse du plan du site
 * (QUAL-17). Exclus de l'exploration :
 * - /api/ : routes d'API, rien à indexer ;
 * - /search : espace de recherche infini (?q, ?topic, ?cites, ?author, pages…), chaque adresse coûte un rendu et un
 *   appel à OpenAlex. Pas de noindex sur la page en plus : un robot qui n'a pas le droit de la lire ne le verrait pas.
 *   Les articles restent atteignables par l'accueil, les thèmes, les articles similaires et le plan du site ;
 * - /__/auth/ : pages d'aide de Firebase Auth relayées (cf. next.config.ts).
 * Les pages personnelles (/favoris, /citations, /compte) et les listes partagées (/liste/…) restent explorables mais
 * portent `noindex` : c'est ce qui les retire des résultats, y compris quand un lien y mène depuis un autre site.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/search", "/__/auth/"] },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
