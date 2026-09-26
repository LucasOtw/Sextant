import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SearchBox } from "@/components/search-box";
import { Results } from "@/components/results";
import { parseSearchParams, type RawSearchParams } from "@/lib/search-params";
import { Skeleton } from "@/components/ui/skeleton";
import { getAuthorProfile, getTopic, getWork } from "@/lib/openalex";
import { workTitle } from "@/lib/format";
import { recover } from "@/lib/log";

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

  // Contexte (sujet, auteur, articles citants) rendu à part : le champ et la recherche partent sans l'attendre.
  const contextLines = [params.topic, params.author, params.cites].filter(Boolean).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-col gap-3">
        <SearchBox size="hero" defaultValue={params.q} hidden={{ topic: params.topic, cites: params.cites, author: params.author }} className="max-w-3xl" />
        {contextLines > 0 && (
          <Suspense
            key={`${params.topic ?? ""}|${params.author ?? ""}|${params.cites ?? ""}`}
            fallback={Array.from({ length: contextLines }, (_, i) => (
              // Hauteur d'une ligne de contexte réservée : la liste de résultats ne saute pas à l'arrivée du texte.
              <Skeleton key={i} className="h-[1.5em] w-72 max-w-full text-[15px]" />
            ))}
          >
            <SearchContext topic={params.topic} author={params.author} cites={params.cites} q={params.q} />
          </Suspense>
        )}
      </div>
      <Results base="/search" sp={sp} params={params} />
    </div>
  );
}

/** Lignes de contexte d'une recherche restreinte à un sujet, à un auteur ou aux citations d'un article. */
async function SearchContext({ topic: topicId, author: authorId, cites, q }: { topic?: string; author?: string; cites?: string; q?: string }) {
  const [topic, cited, author] = await Promise.all([
    topicId ? getTopic(topicId).catch(recover("search.topic", null)) : null,
    cites ? getWork(cites).catch(recover("search.cites", null)) : null,
    authorId ? getAuthorProfile(authorId).catch(recover("search.author", null)) : null,
  ]);
  const clearHref = q ? `/search?q=${encodeURIComponent(q)}` : "/";
  return (
    <>
      {topic && <ContextLine label="Sujet" value={topic.display_name} clearHref={clearHref} />}
      {author && <ContextLine label="Auteur" value={author.name} clearHref={clearHref} />}
      {cited && <ContextLine label="Articles citant" value={workTitle(cited)} clearHref={`/article/${cites}`} />}
    </>
  );
}

function ContextLine({ label, value, clearHref }: { label: string; value: string; clearHref: string }) {
  return (
    <p className="text-[15px] text-muted-foreground">
      {label} : <span className="text-foreground">{value}</span>{" "}
      <Link href={clearHref} className="underline underline-offset-2 hover:text-foreground">
        (retirer)
      </Link>
    </p>
  );
}
