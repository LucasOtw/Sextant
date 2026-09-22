import Link from "next/link";
import { Suspense } from "react";
import { SearchBox } from "@/components/search-box";
import { ThemeGrid } from "@/components/theme-grid";
import { WorkCard } from "@/components/work-card";
import { Skeleton } from "@/components/ui/skeleton";
import { getFeaturedWorks } from "@/lib/openalex";

const EXAMPLES = ["apprentissage automatique santé", "urban heat island", "microplastics ocean", "sleep memory consolidation"];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="flex flex-col items-center gap-6 py-16 text-center sm:py-24">
        <h1 className="title-display max-w-3xl text-5xl leading-[1.05] sm:text-6xl lg:text-7xl">
          Trouvez l'article qui compte<span className="text-accent-brand">.</span>
        </h1>
        <p className="max-w-2xl text-balance text-lg text-muted-foreground">
          Une porte d'entrée vers la littérature scientifique : recherche par mots-clés, métadonnées
          claires, accès au PDF quand il est légal, et des pistes pour aller plus loin.
        </p>
        <SearchBox size="hero" className="max-w-2xl" autoFocus />
        <p className="text-sm text-muted-foreground">
          Essayez :{" "}
          {EXAMPLES.map((q, i) => (
            <span key={q}>
              <Link href={`/search?q=${encodeURIComponent(q)}`} className="underline underline-offset-2 hover:text-foreground">
                {q}
              </Link>
              {i < EXAMPLES.length - 1 && " · "}
            </span>
          ))}
        </p>
      </section>

      <section id="themes" className="scroll-mt-20 py-8">
        <SectionHeading title="Explorer par thématique" subtitle="Seize grands domaines, et leurs sous-thèmes les plus actifs." />
        <ThemeGrid />
      </section>

      <section id="selection" className="scroll-mt-20 py-8 pb-16">
        <SectionHeading
          title="Sélection du moment"
          subtitle="Articles récents en accès ouvert, publiés dans des revues indexées, parmi les plus cités."
        />
        <Suspense fallback={<FeaturedSkeleton />}>
          <Featured />
        </Suspense>
      </section>
    </div>
  );
}

async function Featured() {
  let works: Awaited<ReturnType<typeof getFeaturedWorks>> = [];
  try {
    works = await getFeaturedWorks(6);
  } catch {
    return <p className="text-sm text-muted-foreground">La sélection est momentanément indisponible.</p>;
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {works.map((w) => (
        <li key={w.id}>
          <WorkCard work={w} variant="compact" />
        </li>
      ))}
    </ul>
  );
}

function FeaturedSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
    </div>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h2 className="title-display text-3xl sm:text-4xl">{title}</h2>
      {subtitle && <p className="mt-1.5 text-base text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
