/**
 * Gestion du focus au clavier (WCAG 2.4.3) : lien d'évitement vers une zone de la page, et reprise du focus quand
 * l'élément actif d'une liste disparaît (suppression, retrait d'un favori, révocation…). Sans cela, le focus retombe
 * sur la page : plus d'indicateur visible, et le lecteur d'écran perd sa position (A11Y-11, A11Y-19).
 */

/** Éléments qui peuvent recevoir le focus au clavier (les désactivés et `tabindex="-1"` exclus). */
const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Amène le focus sur `el` et le fait défiler en haut de l'écran (sous l'en-tête collant : `scroll-padding` de html).
 * Un élément qui n'est pas focalisable (ex. `<main>`) le devient le temps d'être quitté : il ne capte pas les clics
 * ensuite, et le prochain Tab repart de lui.
 */
export function focusElement(el: HTMLElement): void {
  if (!el.hasAttribute("tabindex")) {
    el.setAttribute("tabindex", "-1");
    el.addEventListener("blur", () => el.removeAttribute("tabindex"), { once: true });
  }
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "start" });
}

/** Ce qui désigne un contrôle dans sa ligne, pour retrouver son équivalent dans la ligne voisine. */
export interface FocusKey {
  /** Attribut `data-focus-key` (le plus sûr : posé exprès sur l'action qui retire la ligne). */
  key: string | null;
  /** Nom accessible s'il est identique d'une ligne à l'autre (ex. « Favori »). */
  label: string | null;
  /** Rang parmi les éléments focalisables de la ligne, en dernier recours. */
  index: number;
}

export function focusKeyOf(row: Element, el: HTMLElement): FocusKey {
  return {
    key: el.closest<HTMLElement>("[data-focus-key]")?.dataset.focusKey ?? null,
    label: el.getAttribute("aria-label"),
    index: [...row.querySelectorAll<HTMLElement>(FOCUSABLE)].indexOf(el),
  };
}

/** Le contrôle de `row` qui correspond à `k` : même clé, sinon même nom, sinon même rang, sinon le premier focalisable. */
export function equivalentIn(row: Element, k: FocusKey): HTMLElement | null {
  if (k.key) {
    const byKey = [...row.querySelectorAll<HTMLElement>("[data-focus-key]")].find((e) => e.dataset.focusKey === k.key);
    const target = byKey?.matches(FOCUSABLE) ? byKey : byKey?.querySelector<HTMLElement>(FOCUSABLE);
    if (target) return target;
  }
  const focusables = [...row.querySelectorAll<HTMLElement>(FOCUSABLE)];
  if (k.label) {
    const byLabel = focusables.find((e) => e.getAttribute("aria-label") === k.label);
    if (byLabel) return byLabel;
  }
  return focusables[k.index] ?? focusables[0] ?? null;
}

/** Dernier élément focalisé dans une ligne de la liste : son rang de ligne et de quoi retrouver son équivalent. */
export interface ListFocus {
  el: HTMLElement;
  /** La ligne elle-même : tant qu'elle est là, c'est à elle de gérer son focus (ex. fermeture d'un champ de note). */
  rowEl: Element;
  row: number;
  key: FocusKey;
}

/** Mémorise l'élément `target` s'il est dans une ligne (`rowSelector`) de `container` ; null sinon. */
export function captureListFocus(container: HTMLElement | null, rowSelector: string, target: HTMLElement): ListFocus | null {
  if (!container || !container.contains(target)) return null;
  const rows = [...container.querySelectorAll(rowSelector)];
  const row = rows.findIndex((r) => r.contains(target));
  if (row < 0) return null;
  return { el: target, rowEl: rows[row], row, key: focusKeyOf(rows[row], target) };
}

/**
 * Où rendre le focus après le retrait de la ligne mémorisée, ou null s'il n'y a rien à faire : la ligne est toujours
 * là (déplacée, ou un contrôle interne a disparu : la ligne s'en charge), ou le focus est déjà ailleurs (l'utilisateur
 * est parti de lui-même). La ligne qui a pris la
 * place (la suivante), sinon la précédente, sinon `fallback` (titre de la liste, champ de l'action suivante…).
 */
export function recoveryTarget(
  last: ListFocus | null,
  container: HTMLElement | null,
  rowSelector: string,
  fallback?: () => HTMLElement | null | undefined,
): HTMLElement | null {
  if (!last || last.rowEl.isConnected) return null;
  const active = document.activeElement;
  if (active && active !== document.body && active !== document.documentElement) return null;
  const rows = container ? [...container.querySelectorAll(rowSelector)] : [];
  const row = rows[last.row] ?? rows[last.row - 1];
  return (row ? equivalentIn(row, last.key) : null) ?? fallback?.() ?? null;
}
