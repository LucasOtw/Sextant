"use client";

import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PAGE_SIZE } from "@/lib/list-filter";

interface Props {
  /** Éléments affichés. */
  shown: number;
  /** Éléments correspondant au filtre (le compteur et les exports portent sur eux tous). */
  total: number;
  onMore: () => void;
}

/** Bouton « Afficher plus » des grandes listes du compte, rendues par tranches (PERF-11). */
export function ShowMore({ shown, total, onMore }: Props) {
  if (shown >= total) return null;
  const next = Math.min(PAGE_SIZE, total - shown);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <Button variant="outline" size="lg" onClick={onMore}>
        <ChevronDownIcon /> Afficher {next} de plus
      </Button>
      <p className="text-sm text-muted-foreground">{shown} affichés sur {total}</p>
    </div>
  );
}
