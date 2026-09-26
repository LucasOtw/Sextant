/**
 * Surlignage des passages retenus dans la couche texte de PDF.js. Extrait de `components/highlights/pdf-reader.tsx`
 * (aucune dépendance React) pour être testé sous happy-dom ; l'appariement lui-même est une fonction pure (QUAL-40).
 */

/** Texte comparable : minuscules, sans aucun blanc. */
function compactLower(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

/**
 * Index des fragments couverts par au moins une occurrence d'un passage (toutes les occurrences, sans chevauchement).
 *
 * L'appariement se fait sans les blancs, et chaque caractère garde l'index de son fragment. PDF.js découpe souvent un
 * mot en plusieurs fragments (changement de police, italique, exposant, texte espacé) : les joindre par une espace
 * ferait échouer la recherche du passage sélectionné, et son surlignage disparaîtrait sans erreur. À l'inverse, un
 * saut de ligne entre deux fragments ne gêne pas plus qu'avant : le passage est lui aussi comparé sans blancs.
 */
export function matchSpanIndexes(spanTexts: readonly string[], needles: readonly string[]): Set<number> {
  let full = "";
  const owner: number[] = [];
  spanTexts.forEach((text, i) => {
    const t = compactLower(text);
    full += t;
    for (let k = 0; k < t.length; k++) owner.push(i);
  });
  const hit = new Set<number>();
  for (const raw of needles) {
    const t = compactLower(raw);
    if (!t) continue;
    let idx = full.indexOf(t);
    while (idx >= 0) {
      const end = idx + t.length;
      for (let k = idx; k < end; k++) hit.add(owner[k]);
      idx = full.indexOf(t, end);
    }
  }
  return hit;
}

/**
 * Marque les fragments de la couche texte couverts par un passage retenu (toutes les occurrences sur la page).
 * Le marquage est aussi exposé aux lecteurs d'écran : rôle `mark` (« surligné ») à la place du rôle `presentation` que
 * PDF.js pose sur chaque fragment (A11Y-22). Aucun texte n'est ajouté : la géométrie et la sélection restent intactes.
 */
export function markSpans(container: HTMLElement, texts: string[]) {
  const spans = [...container.querySelectorAll<HTMLSpanElement>("span")].filter((s) => (s.textContent ?? "").trim() && !s.classList.contains("markedContent"));
  for (const s of spans) {
    if (!s.classList.contains("hl")) continue;
    s.classList.remove("hl");
    s.setAttribute("role", "presentation");
  }
  if (texts.length === 0) return;
  const hit = matchSpanIndexes(
    spans.map((s) => s.textContent ?? ""),
    texts,
  );
  for (const i of hit) {
    spans[i].classList.add("hl");
    spans[i].setAttribute("role", "mark");
  }
}
