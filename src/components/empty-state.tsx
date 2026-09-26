import Link from "next/link";
import { RefreshCwIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ResultsLink } from "@/components/results-status";

interface Props {
  title: string;
  hint?: string;
  /** Lien « Réessayer » (recharge la même recherche). */
  retryHref?: string;
  /** Liste de résultats : « Réessayer » remplace la liste, et la liste suivante prendra le focus (A11Y-12). */
  inResults?: boolean;
}

export function EmptyState({ title, hint, retryHref, inResults = false }: Props) {
  const Retry = inResults ? ResultsLink : Link;
  // Dans une liste de résultats, le message tient la place du titre de la liste (h2) : la page garde sa hiérarchie (A11Y-14).
  const Title = inResults ? "h2" : "p";
  return (
    <div className="rounded-xl border border-dashed p-10 text-center">
      <Title className="text-lg font-medium">{title}</Title>
      {hint && <p className="mt-1 text-base text-muted-foreground">{hint}</p>}
      {retryHref && (
        <Retry href={retryHref} className={buttonVariants({ variant: "outline", className: "mt-5" })}>
          <RefreshCwIcon /> Réessayer
        </Retry>
      )}
    </div>
  );
}
