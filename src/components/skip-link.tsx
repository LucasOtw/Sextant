"use client";

import { focusElement } from "@/lib/focus";
import { cn } from "cn";

/**
 * Lien d'évitement : invisible jusqu'à ce qu'il reçoive le focus au clavier, il amène le focus sur la zone visée
 * (A11Y-11). Un `<a>` natif, pas `next/link` : sans JavaScript, l'ancre suffit encore.
 */
export function SkipLink({ target, children, className }: { target: string; children: React.ReactNode; className?: string }) {
  return (
    <a
      href={`#${target}`}
      onClick={(e) => {
        const el = document.getElementById(target);
        if (!el) return;
        e.preventDefault();
        focusElement(el);
      }}
      // Au-dessus de l'en-tête collant (z-40), en haut à gauche, quelle que soit la position de défilement.
      className={cn(
        "sr-only rounded-md bg-background text-sm font-medium text-foreground ring-2 ring-ring focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:px-3 focus:py-2",
        className,
      )}
    >
      {children}
    </a>
  );
}
