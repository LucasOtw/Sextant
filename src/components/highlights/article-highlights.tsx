"use client";

import { useState } from "react";
import Link from "next/link";
import { HighlighterIcon, PenLineIcon, QuoteIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HighlightItem } from "@/components/highlights/highlight-item";
import { useHighlights } from "@/components/highlights/highlights-provider";
import { ManualCitationDialog } from "@/components/highlights/manual-citation-dialog";

interface Props {
  /** Barre latérale du lecteur : plus dense, et la page d'un surlignage fait défiler le PDF. */
  compact?: boolean;
  onGoToPage?: (page: number) => void;
  /** Ce qu'on peut surligner ici : le résumé de la fiche, le PDF dans le lecteur. Sans les deux, il reste la saisie à la main. */
  hasAbstract?: boolean;
  hasPdf?: boolean;
}

/** « Mes surlignages » pour un article : la liste, l'ajout à la main, le lien vers toutes les citations. */
export function ArticleHighlights({ compact = false, onGoToPage, hasAbstract = true, hasPdf = compact }: Props) {
  const { enabled, highlights, updateNote, remove, requestSignIn } = useHighlights();
  const [manual, setManual] = useState(false);
  const where = compact ? "du PDF" : hasAbstract && hasPdf ? "du résumé, ou du PDF dans le lecteur" : hasAbstract ? "du résumé" : hasPdf ? "du PDF dans le lecteur" : null;
  const howTo = where
    ? `Sélectionnez une phrase ${where} : un bouton « Surligner » apparaît.`
    : "Le résumé et le texte intégral ne sont pas disponibles ici : notez vos citations à la main en lisant l'article ailleurs.";

  const addButton = (
    <Button variant="outline" size={compact ? "sm" : "default"} onClick={() => (enabled ? setManual(true) : requestSignIn())} className="bg-card">
      <PenLineIcon /> Ajouter une citation à la main
    </Button>
  );

  return (
    <section id="mes-surlignages" aria-labelledby="mes-surlignages-titre" className={compact ? "" : "mt-8"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="mes-surlignages-titre" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <HighlighterIcon className="size-4 text-highlight-foreground" aria-hidden /> Mes surlignages
          {highlights.length > 0 && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium normal-case tracking-normal text-secondary-foreground">{highlights.length}</span>}
        </h2>
        {enabled && highlights.length > 0 && (
          <Link href="/citations" className="text-sm text-accent-brand underline underline-offset-3">Toutes mes citations</Link>
        )}
      </div>

      {!enabled ? (
        <p className="mt-2 text-[15px] text-muted-foreground">
          {where ? `Sélectionnez un passage ${where} pour le surligner, ou notez une citation à la main.` : "Notez vos citations à la main : le résumé et le texte intégral ne sont pas disponibles ici."} Elles sont gardées avec leur source, sur tous vos appareils.{" "}
          <button type="button" onClick={requestSignIn} className="text-accent-brand underline underline-offset-3">Se connecter</button>
        </p>
      ) : highlights.length === 0 ? (
        <div className="mt-3 flex flex-col items-start gap-3 rounded-xl border border-dashed p-4 text-[15px] text-muted-foreground">
          <p className="flex items-start gap-2"><QuoteIcon className="mt-0.5 size-4 shrink-0" aria-hidden /> Aucun passage retenu pour cet article. {howTo}</p>
          {addButton}
        </div>
      ) : (
        <>
          <ul className="mt-3 flex flex-col gap-2">
            {highlights.map((h) => (
              <HighlightItem key={h.id} highlight={h} onNote={(note) => updateNote(h.id, note)} onDelete={() => remove(h.id)} onGoToPage={onGoToPage} compact={compact} />
            ))}
          </ul>
          <div className="mt-3">{addButton}</div>
        </>
      )}
      <ManualCitationDialog open={manual} onOpenChange={setManual} />
    </section>
  );
}
