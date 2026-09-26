import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { SearchFilters } from "@/components/search-filters";
import { WorkCard } from "@/components/work-card";
import { Skeleton } from "@/components/ui/skeleton";
import { OpenAlexError, searchWorks, type SearchParams } from "@/lib/openalex";
import { buildHref, type RawSearchParams } from "@/lib/search-params";

interface Props {
  base: string;
  sp: RawSearchParams;
  params: SearchParams;
  /** Valeurs par défaut à refléter dans les filtres (voir SearchFilters). */
  filterDefaults?: { sort?: string; from?: string; to?: string };
}

/** Filtres + liste + pagination. La liste est chargée en streaming. */
export function Results({ base, sp, params, filterDefaults }: Props) {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <SearchFilters defaults={filterDefaults} />
      </aside>
      <Suspense key={JSON.stringify(params)} fallback={<ListSkeleton />}>
        <List base={base} sp={sp} params={params} />
      </Suspense>
    </div>
  );
}

async function List({ base, sp, params }: Props) {
  let page: Awaited<ReturnType<typeof searchWorks>>;
  try {
    page = await searchWorks(params);
  } catch (e) {
    if (e instanceof OpenAlexError && e.isRateLimited) {
      return (
        <EmptyState
          title="OpenAlex est très sollicité en ce moment."
          hint="Notre source limite temporairement les recherches. Réessayez dans une minute, les résultats reviendront."
          retryHref={buildHref(base, sp, {})}
        />
      );
    }
    return <EmptyState title="La recherche a échoué." hint="OpenAlex ne répond pas pour le moment. Réessayez dans quelques instants." retryHref={buildHref(base, sp, {})} />;
  }

  if (page.results.length === 0) {
    return (
      <EmptyState
        title="Aucun résultat."
        hint="Essayez des mots-clés plus généraux, en anglais, ou retirez un filtre."
      />
    );
  }

  const total = page.meta.count;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[15px] text-muted-foreground">
        {new Intl.NumberFormat("fr-FR").format(total)} résultat{total > 1 ? "s" : ""}
        {params.q && <> pour « {params.q} »</>}
      </p>
      <ul className="flex flex-col gap-3">
        {page.results.map((w, i) => (
          <li
            key={w.id}
            className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-400 motion-reduce:animate-none"
            style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
          >
            <WorkCard work={w} />
          </li>
        ))}
      </ul>
      <Pagination
        page={params.page ?? 1}
        perPage={params.perPage ?? 20}
        total={total}
        hrefFor={(p) => buildHref(base, sp, { page: p > 1 ? p : undefined })}
      />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-4 w-40" />
      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
    </div>
  );
}
