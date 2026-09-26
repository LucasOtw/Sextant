import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { ResultsLink } from "@/components/results-status";
import { buttonVariants } from "@/components/ui/button";
import { lastPageOf } from "@/lib/search-params";
import { cn } from "cn";

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
      // Lien inactif exposé comme tel (aria-disabled) : les lecteurs d'écran l'annoncent « indisponible », et un
      // composant inactif est exempté du contraste minimal (WCAG 1.4.3), d'où l'opacité réduite.
      <span role="link" aria-disabled="true" className={cn(buttonVariants({ variant: "outline" }), "pointer-events-none opacity-50")}>
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
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4 pt-4">
      {link(page - 1, "Précédent", <ChevronLeftIcon />, page <= 1)}
      <span className="text-sm text-muted-foreground">
        Page {page} sur {new Intl.NumberFormat("fr-FR").format(lastPage)}
      </span>
      {link(page + 1, "Suivant", <ChevronRightIcon />, page >= lastPage)}
    </nav>
  );
}
