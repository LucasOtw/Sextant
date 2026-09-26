/**
 * Surlignage des passages retenus dans la couche texte de PDF.js. Extrait de `components/highlights/pdf-reader.tsx`
 * (aucune dépendance React) pour être testé sous happy-dom ; l'appariement lui-même est une fonction pure (QUAL-40).
 */

/**
 * Texte d'une couche de fragments tel qu'une sélection le rend, et le fragment d'origine de chaque caractère.
 *
 * Les blancs sont réduits à une espace, gardée seulement là où la source en contient un : dans un fragment, au bord
 * d'un fragment (« change » + « plus »), ou dans un fragment fait de blancs (saut de ligne `<br>` de PDF.js, espace
 * isolée). Deux fragments collés restent collés : PDF.js coupe souvent un mot en deux (changement de police, italique,
 * exposant), et « exam » + « ple » doit donner « example ». Inversement, aucune frontière n'est inventée : « The
 * rapist » ne se lit pas « therapist ». L'espace d'une frontière appartient au fragment qui la suit.
 */
export function joinFragments(fragments: readonly string[]): { text: string; owner: number[] } {
  let text = "";
  const owner: number[] = [];
  let gap = false;
  fragments.forEach((raw, i) => {
    const t = raw.replace(/\s+/g, " ");
    const body = t.trim();
    if (t.startsWith(" ")) gap = true;
    if (!body) return;
    if (gap && text) {
      text += " ";
      owner.push(i);
    }
    text += body;
    for (let k = 0; k < body.length; k++) owner.push(i);
    gap = t.endsWith(" ");
  });
  return { text, owner };
}

/**
 * Index des fragments couverts par au moins une occurrence d'un passage (toutes les occurrences, sans chevauchement).
 * Casse ignorée ; blancs réduits à une espace des deux côtés (cf. `joinFragments`), de sorte qu'un passage sélectionné
 * dans la couche texte, ou pris dans `pdfPageText`, s'y retrouve toujours.
 */
export function matchSpanIndexes(spanTexts: readonly string[], needles: readonly string[]): Set<number> {
  // Casse abaissée fragment par fragment : `owner` suit la longueur réelle même si une lettre change de longueur.
  const { text: full, owner } = joinFragments(spanTexts.map((t) => t.toLowerCase()));
  const hit = new Set<number>();
  for (const raw of needles) {
    const t = raw.replace(/\s+/g, " ").trim().toLowerCase();
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
  const spans: HTMLSpanElement[] = [];
  const fragments: string[] = [];
  // Un <br> (fin de ligne PDF.js) ou un fragment fait de blancs sépare les mots : une espace en tête du fragment
  // suivant le dit à `joinFragments`.
  let gap = false;
  for (const node of container.querySelectorAll<HTMLElement>("span, br")) {
    if (node.classList.contains("markedContent")) continue;
    const text = node.tagName === "BR" ? "" : (node.textContent ?? "");
    if (!text.trim()) {
      gap = true;
      continue;
    }
    spans.push(node as HTMLSpanElement);
    fragments.push(gap ? ` ${text}` : text);
    gap = false;
  }
  for (const s of spans) {
    if (!s.classList.contains("hl")) continue;
    s.classList.remove("hl");
    s.setAttribute("role", "presentation");
  }
  if (texts.length === 0) return;
  const hit = matchSpanIndexes(fragments, texts);
  for (const i of hit) {
    spans[i].classList.add("hl");
    spans[i].setAttribute("role", "mark");
  }
}
