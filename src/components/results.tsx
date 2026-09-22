import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { SearchFilters } from "@/components/search-filters";
import { WorkCard } from "@/components/work-card";
import { Skeleton } from "@/components/ui/skeleton";
import { searchWorks, type SearchParams } from "@/lib/openalex";

export type RawSearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function int(v: string | undefined): number | undefined {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Convertit les paramètres d'URL en paramètres de recherche OpenAlex. */
export function parseSearchParams(sp: RawSearchParams, extra: Partial<SearchParams> = {}): SearchParams {
  const sort = first(sp.sort);
  return {
    q: first(sp.q),
    page: Math.max(1, int(first(sp.page)) ?? 1),
    perPage: 20,
    sort: sort === "cited" || sort === "recent" ? sort : "relevance",
    type: first(sp.type),
    oaOnly: first(sp.oa) === "1",
    yearFrom: int(first(sp.from)),
    yearTo: int(first(sp.to)),
    topic: first(sp.topic),
    cites: first(sp.cites),
    language: first(sp.lang),
    coreOnly: first(sp.src) !== "all",
    author: first(sp.author),
    ...extra,
  };
}

export function buildHref(base: string, sp: RawSearchParams, patch: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const val = first(v);
    if (val) params.set(k, val);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === "") params.delete(k);
    else params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

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
    <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
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
  } catch {
    return <EmptyState title="La recherche a échoué." hint="OpenAlex ne répond pas pour le moment. Réessayez dans quelques instants." />;
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
