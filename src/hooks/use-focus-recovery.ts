"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { captureListFocus, recoveryTarget, type ListFocus } from "@/lib/focus";

/**
 * Reprise du focus dans une liste dont les lignes peuvent disparaître sous le focus (supprimer, retirer, révoquer,
 * écarter) : le contrôle équivalent de la ligne suivante, sinon de la précédente, sinon `fallback` quand la liste est
 * vide (A11Y-19). Rien n'est fait si l'utilisateur a déjà mis le focus ailleurs.
 *
 * `containerRef` : l'élément qui contient les lignes (il peut disparaître avec la dernière ligne : `fallback` prend
 * alors le relais). `rowSelector` : les lignes, relatives au conteneur (ex. `:scope > li`).
 */
export function useFocusRecovery(
  containerRef: RefObject<HTMLElement | null>,
  rowSelector: string,
  fallback?: () => HTMLElement | null | undefined,
) {
  const last = useRef<ListFocus | null>(null);
  const fallbackRef = useRef(fallback);
  useLayoutEffect(() => {
    fallbackRef.current = fallback;
  });

  // Au niveau du document : le conteneur peut être démonté puis remonté (liste vidée puis remplie).
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      if (e.target instanceof HTMLElement) last.current = captureListFocus(containerRef.current, rowSelector, e.target);
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [containerRef, rowSelector]);

  // Après chaque rendu : c'est celui qui retire la ligne qui fait perdre le focus.
  useLayoutEffect(() => {
    const target = recoveryTarget(last.current, containerRef.current, rowSelector, () => fallbackRef.current?.());
    // Ligne toujours là : on garde la mémoire. Ligne retirée : une seule tentative, qu'il y ait une cible ou non.
    if (!target && last.current?.rowEl.isConnected !== false) return;
    last.current = null;
    target?.focus();
  });
}
