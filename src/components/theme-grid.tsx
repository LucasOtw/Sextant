import Link from "next/link";
import { THEMES } from "@/lib/themes";
import { cn } from "@/lib/cn";

export function ThemeGrid({ limit, className }: { limit?: number; className?: string }) {
  const themes = limit ? THEMES.slice(0, limit) : THEMES;
  // Pas de préchargement : /theme/[slug] est dynamique et sans loading.tsx, il ne rapporterait que l'en-tête
  // de la page, au prix d'une invocation serverless par vignette visible (PERF-18).
  return (
    // Une colonne sous 360 px : sur deux, « Informatique » ou « management » se coupaient au milieu du mot (zoom fort).
    <ul className={cn("grid grid-cols-1 gap-3 min-[22.5rem]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4", className)}>
      {themes.map((t) => (
        <li key={t.slug}>
          <Link
            href={`/theme/${t.slug}`}
            prefetch={false}
            className="surface-tint card-link flex h-full flex-col gap-2 rounded-2xl p-4"
          >
            <span className="size-3 rounded-full bg-brand" aria-hidden />
            <span className="card-title title-display text-lg leading-tight">{t.name}</span>
            <span className="text-sm leading-snug text-muted-foreground">{t.description}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
