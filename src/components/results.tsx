import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { RESULTS_ID, ResultsStatus } from "@/components/results-status";
import { SearchFilters } from "@/components/search-filters";
import { WorkCard } from "@/components/work-card";
import { Skeleton } from "@/components/ui/skeleton";
import { SkipLink } from "@/components/skip-link";
import { formatInteger } from "@/lib/format";
import { OpenAlexError, searchWorks, type SearchParams } from "@/lib/openalex";
import { buildHref, lastPageOf, resultsMessage, type RawSearchParams } from "@/lib/search-params";

interface Props {
  base: string;
  sp: RawSearchParams;
  params: SearchParams;
  /** Valeurs par défaut à refléter dans les filtres (voir SearchFilters). */
  filterDefaults?: { sort?: string; from?: string; to?: string };
  /** Lien « Aller aux résultats » avant les filtres ; faux quand la page le place plus haut (sujets de /theme). */
  skipLink?: boolean;
}

/** Filtres + liste + pagination. La liste est chargée en streaming. */
export function Results({ base, sp, params, filterDefaults, skipLink = true }: Props) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      {skipLink && <SkipToResults />}
      <aside aria-labelledby="filtres-titre" className="lg:sticky lg:top-20 lg:self-start">
        <h2 id="filtres-titre" className="sr-only">Filtres</h2>
        <SearchFilters defaults={filterDefaults} />
      </aside>
      <Suspense key={JSON.stringify(params)} fallback={<ListSkeleton />}>
        <List base={base} sp={sp} params={params} />
      </Suspense>
    </div>
  );
}

/**
 * Liste sans résultat (aucun, erreur, quota) : le message remplace la liste, il est annoncé et reçoit le focus comme
 * elle (cible `RESULTS_ID`).
 */
function Empty({ title, hint, retryHref }: { title: string; hint: string; retryHref?: string }) {
  return (
    <div id={RESULTS_ID} tabIndex={-1} className="scroll-mt-20 outline-none">
      <ResultsStatus message={title} />
      <EmptyState title={title} hint={hint} retryHref={retryHref} inResults />
    </div>
  );
}

async function List({ base, sp, params }: Props) {
  let page: Awaited<ReturnType<typeof searchWorks>>;
  try {
    page = await searchWorks(params);
  } catch (e) {
    // Une clé par réponse : « Réessayer » mène à la même adresse (même clé de Suspense), et un nouvel échec rendrait
    // le même message dans le même composant, sans nouvelle annonce ni retour du focus. Remonté, le message est relu et
    // le lien remplacé rend le focus au message.
    const attempt = crypto.randomUUID();
    if (e instanceof OpenAlexError && e.isRateLimited) {
      return (
        <Empty
          key={attempt}
          title="OpenAlex est très sollicité en ce moment."
          hint="Notre source limite temporairement les recherches. Réessayez dans une minute, les résultats reviendront."
          retryHref={buildHref(base, sp, {})}
        />
      );
    }
    return <Empty key={attempt} title="La recherche a échoué." hint="OpenAlex ne répond pas pour le moment. Réessayez dans quelques instants." retryHref={buildHref(base, sp, {})} />;
  }

  if (page.results.length === 0) {
    return <Empty title="Aucun résultat." hint="Essayez des mots-clés plus généraux, en anglais, ou retirez un filtre." />;
  }

  const total = page.meta.count;
  const current = params.page ?? 1;
  const perPage = params.perPage ?? 20;
  const last = lastPageOf(total, perPage);
  return (
    <div className="flex flex-col gap-3">
      <ResultsStatus message={resultsMessage(total, current, perPage, params.q)} />
      {/* Titre de la liste, focalisable : cible du focus après un changement de page (sinon renvoyé sur la page, A11Y-12). */}
      <h2 id={RESULTS_ID} tabIndex={-1} className="scroll-mt-20 text-meta font-normal text-muted-foreground outline-none">
        {formatInteger(total)} résultat{total > 1 ? "s" : ""}
        {params.q && <> pour «&nbsp;{params.q}&nbsp;»</>}
        {/* Lu quand le titre prend le focus après la pagination, à la place d'une annonce qui répéterait le nombre. */}
        {last > 1 && <span className="sr-only">, page {current} sur {formatInteger(last)}</span>}
      </h2>
      <ul className="flex flex-col gap-3">
        {page.results.map((w) => (
          <li key={w.id}>
            <WorkCard work={w} />
          </li>
        ))}
      </ul>
      <Pagination
        page={current}
        perPage={perPage}
        total={total}
        hrefFor={(p) => buildHref(base, sp, { page: p > 1 ? p : undefined })}
      />
    </div>
  );
}

/** Saute les filtres (et, sur /theme, les sujets) : jusqu'à 21 arrêts au clavier avant le premier résultat (A11Y-11). */
export function SkipToResults() {
  return <SkipLink target={RESULTS_ID}>Aller aux résultats</SkipLink>;
}

function ListSkeleton() {
  return (
    // Cible de « Aller aux résultats » pendant le chargement aussi.
    <div id={RESULTS_ID} tabIndex={-1} className="flex flex-col gap-3 outline-none" aria-busy="true">
      <p role="status" className="sr-only">Chargement des résultats…</p>
      <Skeleton className="h-4 w-40" />
      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
    </div>
  );
}
