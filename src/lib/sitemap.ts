import type { MetadataRoute } from "next";
import { shortId } from "@/lib/openalex";
import { SITE } from "@/lib/site";
import { THEMES } from "@/lib/themes";

/** Pages légales et d'information, prérendues (STATIC_PAGES de lib/csp.ts, hors accueil). */
const INFO_PAGES = ["a-propos", "conditions", "confidentialite", "mentions-legales"];

/**
 * Entrées du plan du site (QUAL-17) : accueil, 16 thèmes, « Bugs et idées », pages d'information et légales, puis les
 * articles donnés (identifiants OpenAlex). Jamais de page personnelle (/favoris, /citations, /compte), de liste
 * partagée (/liste/…) ni de recherche (/search, exclue par robots.txt).
 */
export function sitemapEntries(workIds: string[] = []): MetadataRoute.Sitemap {
  const url = (path: string) => `${SITE.url}${path}`;
  return [
    { url: url("/"), changeFrequency: "daily", priority: 1 },
    ...THEMES.map((t) => ({ url: url(`/theme/${t.slug}`), changeFrequency: "daily" as const, priority: 0.8 })),
    { url: url("/retours"), changeFrequency: "weekly", priority: 0.4 },
    ...INFO_PAGES.map((p) => ({ url: url(`/${p}`), changeFrequency: "monthly" as const, priority: 0.3 })),
    ...[...new Set(workIds.map(shortId))].map((id) => ({ url: url(`/article/${id}`), changeFrequency: "monthly" as const, priority: 0.5 })),
  ];
}
