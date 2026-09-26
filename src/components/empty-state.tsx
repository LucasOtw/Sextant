import type { ReactNode, Ref } from "react";
import Link from "next/link";
import { RefreshCwIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ResultsLink } from "@/components/results-status";
import { cn } from "cn";
import { frSpaces } from "@/lib/text";

interface Props {
  title: string;
  hint?: ReactNode;
  /** Illustration au-dessus du titre (icône centrée). */
  icon?: ReactNode;
  /** Action proposée sous le texte (bouton, lien), avec sa propre marge. */
  action?: ReactNode;
  /** Lien « Réessayer » (recharge la même recherche). */
  retryHref?: string;
  /** Liste de résultats : « Réessayer » remplace la liste, et la liste suivante prendra le focus (A11Y-12). */
  inResults?: boolean;
  /** Titre focalisable par programme (`focusableTitle`) : cible du focus quand le dernier élément d'une liste disparaît (A11Y-19). */
  titleRef?: Ref<HTMLParagraphElement>;
  focusableTitle?: boolean;
  className?: string;
}

/** État vide ou indisponible d'une liste : zone teintée, titre, explication, action éventuelle (QUAL-13). */
export function EmptyState({ title, hint, icon, action, retryHref, inResults = false, titleRef, focusableTitle = false, className }: Props) {
  const Retry = inResults ? ResultsLink : Link;
  const titleClass = cn("title-display text-xl", Boolean(icon) && "mt-3", focusableTitle && "outline-none");
  return (
    <div className={cn("surface-tint rounded-2xl p-10 text-center", className)}>
      {icon}
      {/* Dans une liste de résultats, le message tient la place du titre de la liste (h2) : la page garde sa hiérarchie (A11Y-14). */}
      {inResults ? (
        <h2 className={titleClass}>{frSpaces(title)}</h2>
      ) : (
        <p ref={titleRef} tabIndex={focusableTitle ? -1 : undefined} className={titleClass}>
          {frSpaces(title)}
        </p>
      )}
      {hint && <p className="mx-auto mt-1 max-w-measure-text text-base text-muted-foreground">{hint}</p>}
      {action}
      {retryHref && (
        <Retry href={retryHref} className={buttonVariants({ variant: "outline", className: "mt-5" })}>
          <RefreshCwIcon /> Réessayer
        </Retry>
      )}
    </div>
  );
}
