import type { MetadataRoute } from "next";

/** /robots.txt prérendu en statique (au lieu d'un 404 rendu à chaque passage de robot) ; les routes d'API ne sont pas à indexer. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: "/api/" } };
}
