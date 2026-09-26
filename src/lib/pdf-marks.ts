/**
 * Surlignage des passages retenus dans la couche texte de PDF.js. Extrait de `components/highlights/pdf-reader.tsx`
 * (aucune dépendance React) pour être testé sous happy-dom.
 */
function normalize(s: string) {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
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
  let full = "";
  const bounds: [number, number][] = [];
  for (const s of spans) {
    const t = normalize(s.textContent ?? "");
    if (full) full += " ";
    bounds.push([full.length, full.length + t.length]);
    full += t;
  }
  for (const raw of texts) {
    const t = normalize(raw);
    if (!t) continue;
    let idx = full.indexOf(t);
    while (idx >= 0) {
      const end = idx + t.length;
      spans.forEach((s, i) => {
        const [a, b] = bounds[i];
        if (a < end && b > idx) {
          s.classList.add("hl");
          s.setAttribute("role", "mark");
        }
      });
      idx = full.indexOf(t, end);
    }
  }
}
