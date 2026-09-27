import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { ResultsLink } from "@/components/results-status";
import { buttonVariants } from "@/components/ui/button";
import { formatInteger } from "@/lib/format";
import { lastPageOf } from "@/lib/search-params";
import { cn } from "@/lib/cn";

interface Props {
  page: number;
  perPage: number;
  total: number;
  /** Construit l'URL d'une page donnée. */
  hrefFor: (page: number) => string;
}

export function Pagination({ page, perPage, total, hrefFor }: Props) {
  const lastPage = lastPageOf(total, perPage);
  if (lastPage <= 1) return null;

  const link = (p: number, label: string, icon: React.ReactNode, disabled: boolean) =>
    disabled ? (
      // Lien inactif exposé comme tel (aria-disabled) : les lecteurs d'écran l'annoncent « indisponible ». Texte en
      // muted-foreground plutôt qu'en opacité réduite : lisible (5,6:1 en clair, 7,6:1 en sombre, A11Y-25).
      <span role="link" aria-disabled="true" className={cn(buttonVariants({ variant: "outline" }), "pointer-events-none text-muted-foreground")}>
        {icon}
        {label}
      </span>
    ) : (
      // La liste suivante prendra le focus : ce lien disparaît pendant le chargement (A11Y-12).
      <ResultsLink href={hrefFor(p)} className={buttonVariants({ variant: "outline" })} rel={p < page ? "prev" : "next"}>
        {icon}
        {label}
      </ResultsLink>
    );

  return (
    // flex-wrap : avec l'espacement du texte agrandi (WCAG 1.4.12) à 320 px, « Suivant » passe dessous au lieu de déborder.
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-4">
      {link(page - 1, "Précédent", <ChevronLeftIcon />, page <= 1)}
      <span className="text-sm text-muted-foreground">
        Page {page} sur {formatInteger(lastPage)}
      </span>
      {link(page + 1, "Suivant", <ChevronRightIcon />, page >= lastPage)}
    </nav>
  );
}
