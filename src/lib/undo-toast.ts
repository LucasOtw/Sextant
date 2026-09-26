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

const TOASTER = "[data-sonner-toaster]";

/** Dernier élément focalisé hors des notifications : repli du retour de focus après « Annuler » ou la fermeture. */
let lastOutside: HTMLElement | null = null;
let tracking = false;

function trackFocus() {
  if (tracking || typeof document === "undefined") return;
  tracking = true;
  document.addEventListener("focusin", (e) => {
    const t = e.target;
    if (t instanceof HTMLElement && t !== document.body && !t.closest(TOASTER)) lastOutside = t;
  });
}

/**
 * Quitte les notifications avant que le bouton cliqué ne disparaisse. Sonner ne rend le focus (à l'élément actif avant
 * Alt+T) que lorsque la liste perd le focus ou se démonte : si un autre toast reste affiché ou arrive (« Favori
 * rétabli », une seconde suppression), le bouton retiré laissait le focus sur <body>, et Sonner le reprenait plus tard,
 * n'importe où. Retirer le focus du bouton pendant qu'il existe encore déclenche tout de suite ce retour.
 */
function leaveToaster() {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.closest(TOASTER)) active.blur();
}

/** Après le rendu : si le focus est resté sur <body> (élément d'origine retiré), le pose sur la cible de l'appelant ou le repli. */
function recoverFocus(restoreFocus?: () => HTMLElement | null) {
  requestAnimationFrame(() => {
    if (document.activeElement && document.activeElement !== document.body) return;
    const target = restoreFocus?.() ?? lastOutside;
    if (target?.isConnected) target.focus({ preventScroll: true });
  });
}

/**
 * Toast d'une action réversible : « Annuler » pendant 10 s, bouton de fermeture, raccourci clavier annoncé. Après
 * « Annuler » ou la fermeture, le focus revient dans la page (A11Y-19) : à `restoreFocus()` si l'appelant en donne
 * une, sinon au dernier élément focalisé hors des notifications.
 */
export function undoToast(message: string, onUndo: () => void, description?: ReactNode, restoreFocus?: () => HTMLElement | null) {
  trackFocus();
  return toast(message, {
    description: createElement(Fragment, null, description, createElement("span", { className: "sr-only" }, HOTKEY_HINT)),
    duration: UNDO_TOAST_MS,
    closeButton: true,
    action: {
      label: "Annuler",
      onClick: () => {
        leaveToaster();
        onUndo();
        recoverFocus(restoreFocus);
      },
    },
    onDismiss: () => {
      leaveToaster();
      recoverFocus(restoreFocus);
    },
  });
}
