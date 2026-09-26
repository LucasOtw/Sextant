"use client";

import { useLayoutEffect, useRef } from "react";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PAGE_SIZE } from "@/lib/list-filter";

interface Props {
  /** Éléments affichés. */
  shown: number;
  /** Éléments correspondant au filtre (le compteur et les exports portent sur eux tous). */
  total: number;
  /** Accord du compteur avec les éléments comptés : « affichées » pour les citations, « affichés » par défaut. */
  feminine?: boolean;
  onMore: () => void;
}

/**
 * Bouton « Afficher plus » des grandes listes du compte, rendues par tranches (PERF-11). Le compteur est une région
 * d'état : « 100 affichés sur 240 » est annoncé après l'ajout. Le focus, lui, est déplacé par `useRevealFocus`.
 */
export function ShowMore({ shown, total, feminine = false, onMore }: Props) {
  const counter = `${shown} ${feminine ? "affichées" : "affichés"} sur ${total}`;
  if (shown >= total) return null;
  const next = Math.min(PAGE_SIZE, total - shown);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <Button variant="outline" size="lg" onClick={onMore}>
        <ChevronDownIcon /> Afficher {next} de plus
      </Button>
      <p role="status" className="text-sm text-muted-foreground">{counter}</p>
    </div>
  );
}

/**
 * Focus sur le premier élément révélé par « Afficher plus » : les éléments s'insèrent au-dessus du bouton, qui garde
 * sinon le focus en bas de liste, et un utilisateur au clavier ou au lecteur d'écran devrait remonter à travers toute
 * la tranche sans savoir qu'elle est là. `reveal(n)` est appelé au clic avec le nombre d'éléments déjà affichés ;
 * après le rendu, l'élément d'indice n (parmi ceux que désigne `itemSelector` dans le conteneur) reçoit le focus.
 */
export function useRevealFocus<T extends HTMLElement>(itemSelector: string) {
  const containerRef = useRef<T>(null);
  const revealFrom = useRef<number | null>(null);
  useLayoutEffect(() => {
    const from = revealFrom.current;
    if (from === null) return;
    revealFrom.current = null;
    const target = containerRef.current?.querySelectorAll<HTMLElement>(itemSelector)[from];
    if (!target) return;
    // Un élément de liste n'est pas focalisable par défaut : focalisable par script seulement, hors de l'ordre de tabulation.
    if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
    target.focus();
  });
  const reveal = (alreadyShown: number) => {
    revealFrom.current = alreadyShown;
  };
  return { containerRef, reveal };
}
