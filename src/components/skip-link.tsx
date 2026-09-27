"use client";

import { focusElement } from "@/lib/focus";
import { cn } from "@/lib/cn";

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
      // Au-dessus de l'en-tête collant (z-40), en haut à gauche, quelle que soit la position de défilement. Pilule, focus
      // commun du site (un seul contour, pas d'anneau en plus).
      className={cn(
        "sr-only rounded-full border border-border bg-card text-sm font-semibold text-foreground shadow-float focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:px-4 focus:py-2",
        className,
      )}
    >
      {children}
    </a>
  );
}
