import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SearchBox } from "@/components/search-box";
import { Results, SkipToResults } from "@/components/results";
import { pagedTitle, parseSearchParams, type RawSearchParams } from "@/lib/search-params";
import { toggleChip } from "@/components/ui/toggle-chip";
import { shortId } from "@/lib/ids";
import { getTopicsForField } from "@/lib/openalex";
import { themeBySlug, themePageMeta } from "@/lib/themes";
import { cn } from "@/lib/cn";
import { recover } from "@/lib/log";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}

/** Nombre de sujets en pastilles : le même appel (mis en cache) sert la page et ses métadonnées. */
const TOPICS_SHOWN = 14;

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const theme = themeBySlug((await params).slug);
  const { page, topic } = parseSearchParams(await searchParams);
  // La page dans le titre : l'annonceur de routes de Next lit le nouveau titre à la pagination (A11Y-12).
  if (!theme) return { title: pagedTitle("Thématique", page) };
  // Page d'un sujet : son nom dans le titre et la description (liste des sujets en cache, la même que celle de la page).
  const topics = topic ? await getTopicsForField(theme.fieldId, TOPICS_SHOWN).catch(recover("theme.topics.meta", null)) : [];
  // Description propre au thème ou au sujet (au lieu de celle du site, répétée sur les 16 pages) et adresse canonique (QUAL-18).
  const meta = themePageMeta(theme, page, topic, topics);
  return { title: pagedTitle(meta.name, page), description: meta.description, alternates: { canonical: meta.canonical } };
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

  const topics = await getTopicsForField(theme.fieldId, TOPICS_SHOWN).catch(recover("theme.topics", []));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-col gap-3">
        {/* Fil d'Ariane : repère de navigation, lien souligné, séparateur non lu, page courante signalée (A11Y-37). */}
        <nav aria-label="Fil d'Ariane">
          <ol className="flex items-center gap-2 text-meta text-muted-foreground">
            <li>
              <Link href="/#themes" className="link-quiet">Thématiques</Link>
            </li>
            <li aria-hidden>/</li>
            <li className="flex items-center gap-2">
              <span className={cn("size-2 rounded-full", theme.tone)} aria-hidden />
              <span aria-current="page" className="text-foreground">{theme.name}</span>
            </li>
          </ol>
        </nav>
        <h1 className="title-display type-h1">{theme.name}</h1>
        <p className="lead">{theme.description}</p>
        <SearchBox size="hero" defaultValue={search.q} className="max-w-3xl" />
        <SkipToResults />
        {topics.length > 0 && (
          // Le sujet actif est exposé (aria-current) avec l'effet du lien, qui retire le filtre : la couleur seule ne le dit pas (A11Y-37).
          <div role="group" aria-label="Filtrer par sujet" className="flex flex-wrap gap-1.5 pt-1">
            {topics.map((t) => {
              const id = shortId(t.id);
              const active = search.topic === id;
              return (
                <Link
                  key={t.id}
                  href={active ? `/theme/${slug}` : `/theme/${slug}?topic=${id}`}
                  aria-current={active ? "true" : undefined}
                  {...toggleChip({ active, size: "wrap" })}
                >
                  {t.display_name}
                  {active && <span className="sr-only"> (filtre actif, activer pour le retirer)</span>}
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
