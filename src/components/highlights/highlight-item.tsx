"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CheckIcon, CopyIcon, PenLineIcon, QuoteIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/hooks/use-copy";
import { Textarea } from "@/components/ui/textarea";
import { citationBlock, MAX_NOTE, sourceLabel, type Highlight } from "@/lib/highlights-shared";
import { excerpt } from "@/lib/labels";
import { cn } from "cn";

const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });
/** Au-delà, le passage est replié : la carte reste lisible dans une barre latérale. */
const LONG_TEXT = 420;

interface Props {
  highlight: Highlight;
  /** Article rétracté : la référence copiée le signale. */
  retracted?: boolean;
  onNote: (note: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  /** Clic sur la page (lecteur PDF) : aller à la page. */
  onGoToPage?: (page: number) => void;
  compact?: boolean;
  /** Longue liste (/citations) : la carte hors de l'écran n'est ni mise en page ni peinte (PERF-11). */
  deferPaint?: boolean;
  /** Langue de l'article (A11Y-04) : posée sur un passage pris dans le résumé ou le PDF, pas sur une saisie à la main. */
  lang?: string;
}

/** Un passage retenu : la citation au surligneur, sa source, une note modifiable, copier avec la référence, supprimer. */
export function HighlightItem({ highlight: h, retracted = false, onNote, onDelete, onGoToPage, compact = false, deferPaint = false, lang }: Props) {
  const { copied, copy: copyText } = useCopy();
  const [note, setNote] = useState(h.note);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const passageId = useId();
  /** Vrai dès que l'édition se ferme : le blur émis par Chrome au démontage du champ ne doit pas ré-enregistrer. */
  const closedRef = useRef(false);
  /** Bouton qui ouvre l'édition (« Ajouter une note… » ou « Modifier la note ») : le focus y revient à la fermeture. */
  const noteButtonRef = useRef<HTMLButtonElement>(null);
  /** Levé par Échap et Cmd/Ctrl+Entrée : sans cela, le démontage du champ ferait retomber le focus sur la page (A11Y-06). */
  const restoreFocusRef = useRef(false);
  const long = h.text.length > LONG_TEXT;
  const unsaved = editing && note.trim() !== h.note;

  // Note en cours de saisie (enregistrée seulement au blur ou à Cmd+Entrée) : le navigateur prévient avant de quitter.
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  // Pas au blur : l'utilisateur est déjà parti ailleurs (Tab, clic), on ne lui reprend pas le focus.
  useEffect(() => {
    if (editing || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    noteButtonRef.current?.focus();
  }, [editing]);

  function startEditing() {
    closedRef.current = false;
    setEditing(true);
  }

  const copy = () => void copyText(citationBlock(h, retracted), { message: "Passage copié avec sa référence.", failure: "Presse-papiers indisponible." });

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

  const source = h.page && onGoToPage ? (
    <button type="button" onClick={() => onGoToPage(h.page!)} className="underline underline-offset-2 hover:text-foreground">{sourceLabel(h)}</button>
  ) : (
    <span>{sourceLabel(h)}</span>
  );

  return (
    <li className={cn("rounded-xl bg-card ring-1 ring-foreground/10 transition-shadow hover:shadow-sm", compact ? "p-3.5" : "p-4 sm:p-5", deferPaint && "[contain-intrinsic-size:auto_160px] [content-visibility:auto]")}>
      <blockquote lang={h.source === "manual" ? undefined : lang} className={cn("relative pl-6 leading-relaxed", compact ? "text-sm" : "text-[0.9375rem]")}>
        <QuoteIcon className="absolute left-0 top-[0.35em] size-3.5 text-highlight-foreground" aria-hidden />
        {/* Le repli porte sur un bloc ; le trait de surligneur reste sur le texte en ligne, fragment par fragment. */}
        <div id={passageId} className={cn("whitespace-pre-line", long && !expanded && "line-clamp-6")}>
          <span className="hl-text">{h.text}</span>
        </div>
      </blockquote>
      {long && (
        <button type="button" onClick={() => setExpanded((e) => !e)} className="mt-1 pl-6 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground" aria-expanded={expanded} aria-controls={passageId}>
          {expanded ? "Réduire" : "Lire le passage en entier"}
        </button>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 pl-6 text-xs text-muted-foreground">
        {source}
        {h.createdAt && <span>· {DATE.format(new Date(h.createdAt))}</span>}
      </div>
      {editing ? (
        <Textarea
          // eslint-disable-next-line jsx-a11y/no-autofocus -- édition de la note ouverte par le bouton « Modifier / Ajouter une note » : le focus y est attendu.
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => void saveNote()}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              restoreFocusRef.current = true;
              cancelNote();
            }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              restoreFocusRef.current = true;
              void saveNote();
            }
          }}
          maxLength={MAX_NOTE}
          rows={2}
          placeholder="Votre note…"
          aria-label="Note"
          className="mt-2 text-base md:text-sm"
        />
      ) : h.note ? (
        // La note est du texte, lu comme tel ; « Modifier la note » est un bouton à part, dans la barre d'actions. Dans le
        // nom d'un bouton, une note (jusqu'à 1 000 caractères) serait masquée par son aria-label ou interminable (A11Y-06).
        // À la souris, un clic sur la note l'ouvre aussi en édition, comme avant ; au clavier, c'est le bouton.
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- raccourci souris : « Modifier la note » reste l'accès clavier et lecteur d'écran, un rôle de bouton ferait lire la note comme son nom.
        <p onClick={startEditing} className="mt-2 cursor-text pl-6 text-sm whitespace-pre-line wrap-break-word text-foreground">
          <span className="sr-only">Votre note : </span>
          {h.note}
        </p>
      ) : (
        <button ref={noteButtonRef} type="button" onClick={startEditing} className="mt-2 block w-full rounded-md pl-6 text-left text-sm text-muted-foreground italic hover:text-foreground">
          Ajouter une note…
        </button>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-1 pl-4">
        {h.note && !editing && (
          <Button ref={noteButtonRef} variant="ghost" size="sm" onClick={startEditing}>
            <PenLineIcon /> Modifier la note
          </Button>
        )}
        {/* Le nom commence par le texte visible et suit « Copié » (A11Y-26) ; l'annonce de la copie vient de useCopy. */}
        <Button variant="ghost" size="sm" onClick={copy} aria-label={copied ? "Copié" : `Copier avec la référence : « ${excerpt(h.text)} »`}>{copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Copié" : "Copier avec la référence"}</Button>
        <Button variant="ghost" size="sm" data-focus-key="delete" onClick={() => void onDelete()} aria-label={`Supprimer le passage « ${excerpt(h.text)} »`} className="text-muted-foreground hover:text-destructive"><Trash2Icon /> Supprimer</Button>
      </div>
    </li>
  );
}
