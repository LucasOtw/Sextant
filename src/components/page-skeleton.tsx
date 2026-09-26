import { Skeleton } from "@/components/ui/skeleton";

/**
 * Squelettes des `loading.tsx` : retour visuel immédiat à la navigation vers une page rendue à la demande, et
 * préchargement de cette coquille par les liens (Next ne précharge pas une route dynamique sans loading.tsx, PERF-01).
 * - `search` : champ, filtres et liste de résultats (/search) ;
 * - `library` : titre et liste (/favoris, /citations).
 * Jamais sur un segment qui peut répondre 404 (fiche article, thème) : le squelette partirait avec un statut 200 avant
 * `notFound()`, et l'adresse inconnue deviendrait une « soft 404 ».
 */
export function PageSkeleton({ variant }: { variant: "search" | "library" }) {
  return (
    <div className={variant === "search" ? "mx-auto max-w-6xl px-4 py-8 sm:px-6" : "mx-auto max-w-6xl px-4 py-12 sm:px-6"} aria-busy="true">
      <p role="status" className="sr-only">Chargement…</p>
      {variant === "search" ? (
        <>
          <Skeleton className="mb-6 h-14 w-full max-w-3xl rounded-xl" />
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div className="hidden flex-col gap-3 lg:flex">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
            </div>
            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-40" />
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
            </div>
          </div>
        </>
      ) : (
        <div className="max-w-4xl">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="mt-4 h-5 w-full max-w-xl" />
          <div className="mt-8 flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
          </div>
        </div>
      )}
    </div>
  );
}
