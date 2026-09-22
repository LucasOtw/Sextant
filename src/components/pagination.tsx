import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "cn";

interface Props {
  page: number;
  perPage: number;
  total: number;
  /** Construit l'URL d'une page donnée. */
  hrefFor: (page: number) => string;
}

/** OpenAlex limite la pagination simple à 10 000 résultats. */
const MAX_RESULTS = 10_000;

export function Pagination({ page, perPage, total, hrefFor }: Props) {
  const lastPage = Math.max(1, Math.ceil(Math.min(total, MAX_RESULTS) / perPage));
  if (lastPage <= 1) return null;

  const link = (p: number, label: string, icon: React.ReactNode, disabled: boolean) =>
    disabled ? (
      <span className={cn(buttonVariants({ variant: "outline" }), "pointer-events-none opacity-50")}>{icon}{label}</span>
    ) : (
      <Link href={hrefFor(p)} className={buttonVariants({ variant: "outline" })} rel={p < page ? "prev" : "next"}>
        {icon}
        {label}
      </Link>
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
