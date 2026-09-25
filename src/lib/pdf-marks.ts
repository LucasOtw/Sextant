/**
 * Surlignage des passages retenus dans la couche texte de PDF.js. Extrait de `components/highlights/pdf-reader.tsx`
 * (aucune dépendance React) pour être testé sous happy-dom.
 */
function normalize(s: string) {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Marque les fragments de la couche texte couverts par un passage retenu (toutes les occurrences sur la page). */
export function markSpans(container: HTMLElement, texts: string[]) {
  const spans = [...container.querySelectorAll<HTMLSpanElement>("span")].filter((s) => (s.textContent ?? "").trim() && !s.classList.contains("markedContent"));
  spans.forEach((s) => s.classList.remove("hl"));
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
        if (a < end && b > idx) s.classList.add("hl");
      });
      idx = full.indexOf(t, end);
    }
  }
}
