import Link from "next/link";
import { RefreshCwIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

interface Props {
  title: string;
  hint?: string;
  /** Lien « Réessayer » (recharge la même recherche). */
  retryHref?: string;
}

export function EmptyState({ title, hint, retryHref }: Props) {
  return (
    <div className="rounded-xl border border-dashed p-10 text-center">
      <p className="text-lg font-medium">{title}</p>
      {hint && <p className="mt-1 text-base text-muted-foreground">{hint}</p>}
      {retryHref && (
        <Link href={retryHref} className={buttonVariants({ variant: "outline", className: "mt-5" })}>
          <RefreshCwIcon /> Réessayer
        </Link>
      )}
    </div>
  );
}
