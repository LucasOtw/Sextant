import Link from "next/link";
import { Suspense } from "react";
import { SearchBox } from "@/components/search-box";
import { ThemeGrid } from "@/components/theme-grid";
import { WorkCard } from "@/components/work-card";
import { RecentlyViewed } from "@/components/recently-viewed";
import { ForYou } from "@/components/for-you";
import { Skeleton } from "@/components/ui/skeleton";
import { getFeaturedWorks } from "@/lib/openalex";
import { logError } from "@/lib/log";

// Liens d'exemple non préchargés : /search est dynamique, le préchargement coûtait une invocation sans rien apporter (PERF-18).
const EXAMPLES = ["télétravail et bien-être", "transition énergétique villes", "réseaux sociaux santé mentale adolescents", "fast fashion supply chain"];

// Accueil prérendu et régénéré toutes les 10 minutes au plus (PERF-01) ; la sélection OpenAlex reste en cache une heure.
export const revalidate = 600;

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="flex flex-col items-center gap-6 py-16 text-center sm:py-24">
        <h1 className="title-display max-w-3xl text-5xl leading-[1.05] sm:text-6xl lg:text-7xl">
          Trouvez votre cap dans la littérature scientifique<span className="text-accent-brand">.</span>
        </h1>
        <p className="max-w-2xl text-balance text-lg text-muted-foreground">
          Des articles évalués par les pairs, des thèses et des ouvrages universitaires. Cherchez par
          mots-clés, filtrez, et laissez chaque lecture vous mener à la suivante.
        </p>
        {/* eslint-disable-next-line jsx-a11y/no-autofocus -- A11Y-27 (lot 8 de l'audit) : autofocus à retirer de l'accueil. */}
        <SearchBox size="hero" className="max-w-2xl" autoFocus />
        <p className="text-sm text-muted-foreground">
          Essayez :{" "}
          {EXAMPLES.map((q, i) => (
            <span key={q}>
              <Link href={`/search?q=${encodeURIComponent(q)}`} prefetch={false} className="underline underline-offset-2 hover:text-foreground">
                {q}
              </Link>
              {i < EXAMPLES.length - 1 && " · "}
            </span>
          ))}
        </p>
      </section>

      <section id="themes" className="py-8">
        <SectionHeading title="Explorer par thématique" subtitle="Vous ne savez pas encore quoi chercher ? Partez de votre discipline." />
        <ThemeGrid />
      </section>

      <section id="selection" className="py-8">
        <SectionHeading
          title="Sélection du moment"
          subtitle="Récents, en accès ouvert, publiés dans des revues indexées : ce que la communauté lit et cite en ce moment."
        />
        <Suspense fallback={<FeaturedSkeleton />}>
          <Featured />
        </Suspense>
      </section>

      <ForYou />

      <RecentlyViewed />
    </div>
  );
}

async function Featured() {
  let works: Awaited<ReturnType<typeof getFeaturedWorks>> = [];
  try {
    works = await getFeaturedWorks(6);
  } catch (e) {
    logError("home.featured", e);
    // En production hors build, l'échec est relancé : une régénération ratée garde la dernière page réussie au lieu de
    // mettre ce repli en cache pour tous. Au build, le repli évite qu'une panne d'OpenAlex fasse échouer le
    // déploiement ; en développement, rien n'est mis en cache et le repli reste plus lisible qu'une erreur.
    if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") throw e;
    return <p className="text-sm text-muted-foreground">La sélection est momentanément indisponible.</p>;
  }
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {works.map((w, i) => (
        <li key={w.id} className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-400 motion-reduce:animate-none" style={{ animationDelay: `${i * 50}ms` }}>
          <WorkCard work={w} variant="compact" />
        </li>
      ))}
    </ul>
  );
}

function FeaturedSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
