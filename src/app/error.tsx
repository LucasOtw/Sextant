"use client";

import { ServerError } from "@/components/server-error";

/** Erreur pendant le rendu d'une page : l'en-tête et le pied de page restent en place. */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ServerError error={error} retry={retry} />;
}
