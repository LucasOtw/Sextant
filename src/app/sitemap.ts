import type { MetadataRoute } from "next";
import { getFeaturedWorks } from "@/lib/openalex";
import { recover } from "@/lib/log";
import { sitemapEntries } from "@/lib/sitemap";

// Plan du site régénéré au plus toutes les heures, comme la sélection de l'accueil.
export const revalidate = 3600;

/**
 * /sitemap.xml (QUAL-17) : pages publiques (lib/sitemap.ts), plus les articles de la « Sélection du moment » de
 * l'accueil : la même requête, déjà en cache une heure, donc pas d'appel de plus à OpenAlex. OpenAlex en panne : le
 * plan sort sans les articles plutôt que pas du tout.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const works = await getFeaturedWorks(6).catch(recover("sitemap.featured", []));
  return sitemapEntries(works.map((w) => w.id));
}
