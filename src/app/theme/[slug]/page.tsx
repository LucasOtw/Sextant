import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SearchBox } from "@/components/search-box";
import { Results, SkipToResults } from "@/components/results";
import { pagedTitle, parseSearchParams, type RawSearchParams } from "@/lib/search-params";
import { Badge } from "@/components/ui/badge";
import { shortId } from "@/lib/ids";
import { getTopicsForField } from "@/lib/openalex";
import { themeBySlug, themeCanonical, themeMetaDescription } from "@/lib/themes";
import { cn } from "cn";
import { recover } from "@/lib/log";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const theme = themeBySlug((await params).slug);
  const { page, topic } = parseSearchParams(await searchParams);
  // La page dans le titre : l'annonceur de routes de Next lit le nouveau titre à la pagination (A11Y-12).
  const title = pagedTitle(theme?.name ?? "Thématique", page);
  if (!theme) return { title };
  // Description propre au thème (au lieu de celle du site, répétée sur les 16 pages) et adresse canonique (QUAL-18).
  return { title, description: themeMetaDescription(theme), alternates: { canonical: themeCanonical(theme.slug, page, topic) } };
}

export default async function ThemePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const theme = themeBySlug(slug);
  if (!theme) notFound();

  const sp = await searchParams;
  const search = parseSearchParams(sp, { field: theme.fieldId });
  // Sans requête ni filtre, on montre les plus cités de l'année écoulée : plus parlant qu'un tri historique.
  let filterDefaults: { sort: string; from: string } | undefined;
  if (!search.q && !search.yearFrom && !search.yearTo && !sp.sort) {
    const year = new Date().getFullYear();
    search.yearFrom = year - 1;
    search.sort = "cited";
    filterDefaults = { sort: "cited", from: String(year - 1) };
  }

  const topics = await getTopicsForField(theme.fieldId, 14).catch(recover("theme.topics", []));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-col gap-3">
        {/* Fil d'Ariane : repère de navigation, lien souligné, séparateur non lu, page courante signalée (A11Y-37). */}
        <nav aria-label="Fil d'Ariane">
          <ol className="flex items-center gap-2 text-[0.9375rem] text-muted-foreground">
            <li>
              <Link href="/#themes" className="underline decoration-muted-foreground/50 underline-offset-2 hover:text-foreground hover:decoration-foreground">Thématiques</Link>
            </li>
            <li aria-hidden>/</li>
            <li className="flex items-center gap-2">
              <span className={cn("size-2 rounded-full", theme.tone)} aria-hidden />
              <span aria-current="page" className="text-foreground">{theme.name}</span>
            </li>
          </ol>
        </nav>
        <h1 className="title-display text-4xl sm:text-5xl">{theme.name}</h1>
        <p className="max-w-2xl text-lg text-muted-foreground">{theme.description}</p>
        <SearchBox size="hero" defaultValue={search.q} className="max-w-3xl" />
        <SkipToResults />
        {topics.length > 0 && (
          // Le sujet actif est exposé (aria-current) avec l'effet du lien, qui retire le filtre : la couleur seule ne le dit pas (A11Y-37).
          <div role="group" aria-label="Filtrer par sujet" className="flex flex-wrap gap-1.5 pt-1">
            {topics.map((t) => {
              const id = shortId(t.id);
              const active = search.topic === id;
              return (
                <Link key={t.id} href={active ? `/theme/${slug}` : `/theme/${slug}?topic=${id}`} aria-current={active ? "true" : undefined}>
                  <Badge variant={active ? "default" : "secondary"} className="h-auto min-h-7 cursor-pointer whitespace-normal px-3 py-1 text-sm">
                    {t.display_name}
                    {active && <span className="sr-only"> (filtre actif, activer pour le retirer)</span>}
                  </Badge>
                </Link>
              );
            })}
          </div>
        )}
      </header>
      <Results base={`/theme/${slug}`} sp={sp} params={search} filterDefaults={filterDefaults} skipLink={false} />
    </div>
  );
}
