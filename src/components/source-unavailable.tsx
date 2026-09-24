import { EmptyState } from "@/components/empty-state";

/**
 * OpenAlex ne répond pas (limite de débit, panne, délai dépassé) pour une notice : message dans la page, avec en-tête
 * et navigation, et un lien qui relance la lecture. Toute autre erreur va à la page d'erreur (error.tsx).
 */
export function SourceUnavailable({ rateLimited, retryHref }: { rateLimited: boolean; retryHref: string }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6" role="alert">
      <h1 className="sr-only">Article momentanément indisponible</h1>
      <EmptyState
        title={rateLimited ? "OpenAlex est très sollicité en ce moment." : "Impossible de charger cet article pour le moment."}
        hint="Notre source de données (OpenAlex) ne répond pas. Réessayez dans un instant."
        retryHref={retryHref}
      />
    </div>
  );
}
