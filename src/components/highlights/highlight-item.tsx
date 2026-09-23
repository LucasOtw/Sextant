"use client";

import { useRef, useState } from "react";
import { CheckIcon, CopyIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { citationBlock, MAX_NOTE, sourceLabel, type Highlight } from "@/lib/highlights-shared";
import { cn } from "cn";

const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });

interface Props {
  highlight: Highlight;
  onNote: (note: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  /** Clic sur la page (lecteur PDF) : aller à la page. */
  onGoToPage?: (page: number) => void;
  compact?: boolean;
}

/** Un passage retenu : la citation, sa source, une note modifiable, copier avec la référence, supprimer. */
export function HighlightItem({ highlight: h, onNote, onDelete, onGoToPage, compact = false }: Props) {
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState(h.note);
  const [editing, setEditing] = useState(false);
  /** Vrai dès que l'édition se ferme : le blur émis par Chrome au démontage du champ ne doit pas ré-enregistrer. */
  const closedRef = useRef(false);

  function startEditing() {
    closedRef.current = false;
    setEditing(true);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(citationBlock(h));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Presse-papiers indisponible.");
    }
  }

  async function saveNote() {
    if (closedRef.current) return;
    closedRef.current = true;
    setEditing(false);
    const trimmed = note.trim();
    if (trimmed === h.note) return;
    if (!(await onNote(trimmed))) setNote(h.note);
  }

  function cancelNote() {
    closedRef.current = true;
    setNote(h.note);
    setEditing(false);
  }

  const pageButton = h.page && onGoToPage ? (
    <button type="button" onClick={() => onGoToPage(h.page!)} className="underline underline-offset-2 hover:text-foreground">{sourceLabel(h)}</button>
  ) : (
    <span>{sourceLabel(h)}</span>
  );

  return (
    <li className={cn("rounded-xl border-l-4 border-l-highlight-foreground bg-card p-4 ring-1 ring-foreground/10", compact && "p-3")}>
      <blockquote className={cn("text-[15px] leading-relaxed whitespace-pre-line", compact && "text-sm")}>« {h.text} »</blockquote>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        {pageButton}
        {h.createdAt && <span>· {DATE.format(new Date(h.createdAt))}</span>}
      </div>
      {editing ? (
        <Textarea
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => void saveNote()}
          onKeyDown={(e) => {
            if (e.key === "Escape") cancelNote();
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void saveNote();
          }}
          maxLength={MAX_NOTE}
          rows={2}
          placeholder="Votre note…"
          aria-label="Note"
          className="mt-2 text-sm md:text-sm"
        />
      ) : (
        <button type="button" onClick={startEditing} aria-label={h.note ? "Modifier la note" : "Ajouter une note"} className={cn("mt-2 block w-full rounded-md text-left text-sm whitespace-pre-line", h.note ? "text-foreground" : "text-muted-foreground italic hover:text-foreground")}>
          {h.note || "Ajouter une note…"}
        </button>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button variant="outline" size="sm" onClick={copy} aria-label={`Copier le passage « ${h.text.slice(0, 40)}… » avec sa référence`}>{copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Copié" : "Copier avec la référence"}</Button>
        <Button variant="ghost" size="sm" onClick={() => void onDelete()} aria-label={`Supprimer le passage « ${h.text.slice(0, 40)}… »`} className="text-muted-foreground hover:text-destructive"><Trash2Icon /> Supprimer</Button>
      </div>
    </li>
  );
}
