"use client";

import { useState } from "react";
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
    setEditing(false);
    const trimmed = note.trim();
    if (trimmed === h.note) return;
    if (!(await onNote(trimmed))) setNote(h.note);
  }

  const pageButton = h.page && onGoToPage ? (
    <button type="button" onClick={() => onGoToPage(h.page!)} className="underline underline-offset-2 hover:text-foreground">{sourceLabel(h)}</button>
  ) : (
    <span>{sourceLabel(h)}</span>
  );

  return (
    <li className={cn("rounded-xl border-l-4 border-l-highlight bg-card p-4 ring-1 ring-foreground/10", compact && "p-3")}>
      <blockquote className={cn("text-[15px] leading-relaxed", compact && "text-sm")}>« {h.text} »</blockquote>
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
            if (e.key === "Escape") { setNote(h.note); setEditing(false); }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void saveNote();
          }}
          maxLength={MAX_NOTE}
          rows={2}
          placeholder="Votre note…"
          aria-label="Note"
          className="mt-2 text-sm md:text-sm"
        />
      ) : (
        <button type="button" onClick={() => setEditing(true)} className={cn("mt-2 block w-full rounded-md text-left text-sm", h.note ? "text-foreground" : "text-muted-foreground italic hover:text-foreground")}>
          {h.note || "Ajouter une note…"}
        </button>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button variant="outline" size="sm" onClick={copy}>{copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Copié" : "Copier avec la référence"}</Button>
        <Button variant="ghost" size="sm" onClick={() => void onDelete()} aria-label="Supprimer ce surlignage" className="text-muted-foreground hover:text-destructive"><Trash2Icon /> Supprimer</Button>
      </div>
    </li>
  );
}
