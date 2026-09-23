"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cleanSelectionText } from "@/components/highlights/selection-button";
import { useHighlights } from "@/components/highlights/highlights-provider";
import { readSelection, SelectionButton } from "@/components/highlights/selection-button";

interface Props {
  text: string;
  className?: string;
}

/** Position d'un passage dans le résumé : le contexte avant/après lève l'ambiguïté quand le texte apparaît deux fois. */
function locate(full: string, text: string, prefix: string, suffix: string): [number, number] | null {
  const candidates: number[] = [];
  let from = 0;
  while (from <= full.length) {
    const i = full.indexOf(text, from);
    if (i < 0) break;
    candidates.push(i);
    from = i + 1;
  }
  if (candidates.length === 0) return null;
  // Le contexte stocké a été nettoyé (espaces de bord retirés) : on compare aux voisins normalisés de la même façon.
  const pre = prefix.slice(-20);
  const suf = suffix.slice(0, 20);
  const best =
    candidates.find((i) => {
      const before = full.slice(Math.max(0, i - 200), i).replace(/\s+/g, " ").trimEnd();
      const after = full.slice(i + text.length, i + text.length + 200).replace(/\s+/g, " ").trimStart();
      return (!pre || before.endsWith(pre)) && (!suf || after.startsWith(suf));
    }) ?? candidates[0];
  return [best, best + text.length];
}

/** Le résumé de l'article : sélectionner un passage propose de le surligner ; les passages déjà retenus sont marqués. */
export function HighlightableAbstract({ text, className }: Props) {
  const { highlights, add } = useHighlights();
  const ref = useRef<HTMLParagraphElement>(null);
  const [selection, setSelection] = useState<ReturnType<typeof readSelection>>(null);
  const [busy, setBusy] = useState(false);

  const segments = useMemo(() => {
    const ranges = highlights
      .filter((h) => h.source === "abstract")
      .map((h) => ({ id: h.id, note: h.note, range: locate(text, h.text, h.prefix, h.suffix) }))
      .filter((h): h is { id: string; note: string; range: [number, number] } => h.range !== null)
      .sort((a, b) => a.range[0] - b.range[0]);
    const out: { text: string; id?: string; note?: string }[] = [];
    let cursor = 0;
    for (const r of ranges) {
      const [start, end] = r.range;
      if (start < cursor) continue; // chevauchement : on garde le premier
      if (start > cursor) out.push({ text: text.slice(cursor, start) });
      out.push({ text: text.slice(start, end), id: r.id, note: r.note });
      cursor = end;
    }
    if (cursor < text.length) out.push({ text: text.slice(cursor) });
    return out;
  }, [text, highlights]);

  useEffect(() => {
    let clearTimer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      const el = ref.current;
      if (!el) return;
      const read = readSelection(el);
      // Au toucher, la sélection peut se réduire un instant avant le tap sur le bouton : on n'efface qu'après un court délai.
      if (!read) {
        clearTimer = setTimeout(() => setSelection(null), 300);
        return;
      }
      clearTimeout(clearTimer);
      setSelection({ ...read, text: cleanSelectionText(read.text) });
    };
    document.addEventListener("selectionchange", update);
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      clearTimeout(clearTimer);
      document.removeEventListener("selectionchange", update);
      window.removeEventListener("scroll", update);
    };
  }, []);

  async function save() {
    if (!selection) return;
    setBusy(true);
    const created = await add({ source: "abstract", text: selection.text, prefix: selection.prefix, suffix: selection.suffix, page: null, note: "" });
    setBusy(false);
    if (created) {
      window.getSelection()?.removeAllRanges();
      setSelection(null);
    }
  }

  return (
    <>
      <p ref={ref} className={className}>
        {segments.map((s, i) =>
          s.id ? (
            <mark key={s.id} data-highlight={s.id}>
              <span className="sr-only" data-sr>Début du passage surligné. </span>{s.text}<span className="sr-only" data-sr> Fin du passage surligné.</span>
            </mark>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
      </p>
      <SelectionButton rect={selection?.rect ?? null} onClick={() => void save()} busy={busy} />
    </>
  );
}
