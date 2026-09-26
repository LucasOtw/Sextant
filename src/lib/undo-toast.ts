import { createElement, Fragment, type ReactNode } from "react";
import { toast } from "sonner";

/**
 * Durée d'un toast qui propose « Annuler » : le délai commun de 3,5 s (layout.tsx) ne laisse pas le temps d'y aller
 * au clavier, au lecteur d'écran ou avec une motricité réduite (WCAG 2.2.1, A11Y-20). Le bouton de fermeture permet
 * de le congédier avant.
 */
export const UNDO_TOAST_MS = 10_000;

/** Raccourci de Sonner (Alt+T, Option+T sur Mac) qui amène le focus sur les notifications : dit aux lecteurs d'écran seulement. */
const HOTKEY_HINT = " Alt+T (Option+T sur Mac) pour atteindre le bouton Annuler.";

/** Toast d'une action réversible : « Annuler » pendant 10 s, bouton de fermeture, raccourci clavier annoncé. */
export function undoToast(message: string, onUndo: () => void, description?: ReactNode) {
  return toast(message, {
    description: createElement(Fragment, null, description, createElement("span", { className: "sr-only" }, HOTKEY_HINT)),
    duration: UNDO_TOAST_MS,
    closeButton: true,
    action: { label: "Annuler", onClick: onUndo },
  });
}
