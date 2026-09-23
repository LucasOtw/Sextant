"use client";

import { HighlighterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  rect: { top: number; left: number; width: number } | null;
  onClick: () => void;
  busy?: boolean;
}

/** Bouton flottant « Surligner » au-dessus de la sélection courante. */
export function SelectionButton({ rect, onClick, busy = false }: Props) {
  if (!rect) return null;
  const top = Math.max(8, rect.top - 44);
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - 56), window.innerWidth - 120);
  return (
    <div className="fixed z-50 animate-in fade-in zoom-in-95 duration-150" style={{ top, left }} role="toolbar" aria-label="Sélection">
      <Button size="sm" onMouseDown={(e) => e.preventDefault()} onClick={onClick} disabled={busy} className="shadow-lg">
        <HighlighterIcon /> Surligner
      </Button>
    </div>
  );
}

/** Texte, contexte et rectangle d'une sélection contenue dans `container`, ou null. */
export function readSelection(container: HTMLElement): { text: string; prefix: string; suffix: string; rect: { top: number; left: number; width: number } } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  const text = sel.toString().replace(/\s+/g, " ").trim();
  if (text.length < 3) return null;
  const before = document.createRange();
  before.setStart(container, 0);
  before.setEnd(range.startContainer, range.startOffset);
  const full = container.textContent ?? "";
  const start = before.toString().length;
  const end = start + range.toString().length;
  const rect = range.getBoundingClientRect();
  return {
    text,
    prefix: full.slice(Math.max(0, start - 60), start).replace(/\s+/g, " "),
    suffix: full.slice(end, end + 60).replace(/\s+/g, " "),
    rect: { top: rect.top, left: rect.left, width: rect.width },
  };
}
