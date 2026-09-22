"use client";

import { useState } from "react";
import { cn } from "cn";

/** Vrai dès qu'un premier montage a eu lieu côté client : les montages suivants sont des navigations. */
let hasMountedOnce = false;

/**
 * Fondu + glissement à l'arrivée sur une page, mais pas au premier chargement :
 * le contenu initial doit être visible immédiatement (LCP), l'animation ne vaut que pour les navigations.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const [animate] = useState(() => {
    const isNavigation = hasMountedOnce;
    hasMountedOnce = true;
    return isNavigation;
  });
  return (
    <div className={cn(animate && "animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out motion-reduce:animate-none")}>
      {children}
    </div>
  );
}
