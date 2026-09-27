import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { HeroWave } from "@/components/hero-wave";
import { SearchBox } from "@/components/search-box";
import { ThemeGrid } from "@/components/theme-grid";
import { WorkCard } from "@/components/work-card";
import { RecentlyViewed } from "@/components/recently-viewed";
import { ForYou } from "@/components/for-you";
import { Skeleton } from "@/components/ui/skeleton";
import { getFeaturedWorks } from "@/lib/openalex";
import { logError } from "@/lib/log";
import { frSpaces } from "@/lib/text";

// Liens d'exemple non préchargés : /search est dynamique, le préchargement coûtait une invocation sans rien apporter (PERF-18).
const EXAMPLES = ["télétravail et bien-être", "transition énergétique villes", "réseaux sociaux santé mentale adolescents", "fast fashion supply chain"];

// Accueil prérendu et régénéré toutes les 10 minutes au plus (PERF-01) ; la sélection OpenAlex reste en cache une heure.
export const revalidate = 600;

// Adresse canonique de l'accueil : ?utm_source=…, ?ref=… ou un ancien /?q=… servent le même HTML prérendu. Pas de
// titre ni de description ici : ceux du layout restent ceux de l'accueil.
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="flex flex-col items-center gap-6 pb-10 pt-16 text-center sm:pb-14 sm:pt-24">
        <h1 className="title-display type-hero max-w-3xl">
          Trouvez votre cap dans la littérature scientifique<span className="text-brand">.</span>
        </h1>
        <p className="lead">
          Des articles évalués par les pairs, des thèses et des ouvrages universitaires. Cherchez par
          mots-clés, filtrez, et laissez chaque lecture vous mener à la suivante.
        </p>
        {/* Pas d'autofocus : on arrive en haut de page, titre et en-tête compris ; « Aller au contenu » mène ici (A11Y-27). */}
        <SearchBox size="hero" className="max-w-2xl" />
        <p className="text-sm text-muted-foreground">
          Essayez :{" "}
          {EXAMPLES.map((q, i) => (
            <span key={q}>
              <Link href={`/search?q=${encodeURIComponent(q)}`} prefetch={false} className="link-quiet">
                {q}
              </Link>
              {i < EXAMPLES.length - 1 && " · "}
            </span>
          ))}
        </p>
        <HeroWave className="mt-4" />
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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
    </div>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h2 className="title-display type-h2">{frSpaces(title)}</h2>
      {subtitle && <p className="mt-1.5 max-w-measure-text text-muted-foreground">{frSpaces(subtitle)}</p>}
    </div>
  );
}
