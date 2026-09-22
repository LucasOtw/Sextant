import type { Metadata } from "next";
import Link from "next/link";
import { SearchForm } from "@/components/search-form";
import { Results, parseSearchParams, type RawSearchParams } from "@/components/results";
import { getTopic, getWork } from "@/lib/openalex";
import { workTitle } from "@/lib/format";

interface Props {
  searchParams: Promise<RawSearchParams>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  const query = Array.isArray(q) ? q[0] : q;
  return { title: query ? `« ${query} »` : "Recherche" };
}

export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const params = parseSearchParams(sp);

  // Contexte affiché quand la recherche est restreinte à un sujet ou aux citations d'un article.
  const [topic, cited] = await Promise.all([
    params.topic ? getTopic(params.topic).catch(() => null) : null,
    params.cites ? getWork(params.cites).catch(() => null) : null,
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-col gap-3">
        <SearchForm size="hero" defaultValue={params.q} hidden={{ topic: params.topic, cites: params.cites }} className="max-w-3xl" />
        {topic && (
          <ContextLine label="Sujet" value={topic.display_name} clearHref={params.q ? `/search?q=${encodeURIComponent(params.q)}` : "/"} />
        )}
        {cited && (
          <ContextLine label="Articles citant" value={workTitle(cited)} clearHref={`/article/${params.cites}`} />
        )}
      </div>
      <Results base="/search" sp={sp} params={params} />
    </div>
  );
}

function ContextLine({ label, value, clearHref }: { label: string; value: string; clearHref: string }) {
  return (
    <p className="text-sm text-muted-foreground">
      {label} : <span className="text-foreground">{value}</span>{" "}
      <Link href={clearHref} className="underline underline-offset-2 hover:text-foreground">
        (retirer)
      </Link>
    </p>
  );
}
