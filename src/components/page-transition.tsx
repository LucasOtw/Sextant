"use client";

import { useEffect, useState } from "react";
import { cn } from "cn";

/** Passe à vrai une fois l'hydratation terminée : tout montage ultérieur est une navigation. */
let hydrated = false;

/**
 * Fondu + glissement à l'arrivée sur une page, mais pas au premier chargement :
 * le contenu initial doit être visible immédiatement (LCP), l'animation ne vaut que pour les navigations.
 * Le drapeau est posé dans un effet (jamais dans l'initialiseur d'état) pour rester identique au rendu serveur
 * pendant l'hydratation, y compris sous le double appel du mode strict de React.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const [animate] = useState(() => hydrated);
  useEffect(() => {
    hydrated = true;
  }, []);
  return (
    <div className={cn(animate && "animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out motion-reduce:animate-none")}>
      {children}
    </div>
  );
}
