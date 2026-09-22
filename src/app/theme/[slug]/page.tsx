import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SearchForm } from "@/components/search-form";
import { Results, parseSearchParams, type RawSearchParams } from "@/components/results";
import { Badge } from "@/components/ui/badge";
import { getTopicsForField } from "@/lib/openalex";
import { THEMES, themeBySlug } from "@/lib/themes";
import { cn } from "cn";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}

export function generateStaticParams() {
  return THEMES.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const theme = themeBySlug((await params).slug);
  return { title: theme?.name ?? "Thématique" };
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

  const topics = await getTopicsForField(theme.fieldId, 14).catch(() => []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/#themes" className="hover:text-foreground">Thématiques</Link>
          <span>/</span>
          <span className={cn("size-2 rounded-full", theme.tone)} aria-hidden />
          <span className="text-foreground">{theme.name}</span>
        </div>
        <h1 className="title-serif text-4xl sm:text-5xl">{theme.name}</h1>
        <p className="max-w-2xl text-muted-foreground">{theme.description}</p>
        <SearchForm size="hero" defaultValue={search.q} className="max-w-3xl" />
        {topics.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {topics.map((t) => {
              const id = t.id.replace(/^.*\//, "");
              const active = search.topic === id;
              return (
                <Link key={t.id} href={active ? `/theme/${slug}` : `/theme/${slug}?topic=${id}`}>
                  <Badge variant={active ? "default" : "secondary"} className="h-6 cursor-pointer px-2.5">
                    {t.display_name}
                  </Badge>
                </Link>
              );
            })}
          </div>
        )}
      </header>
      <Results base={`/theme/${slug}`} sp={sp} params={search} filterDefaults={filterDefaults} />
    </div>
  );
}
