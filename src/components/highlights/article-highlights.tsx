"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { HighlighterIcon, PenLineIcon, QuoteIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HighlightItem } from "@/components/highlights/highlight-item";
import { useHighlights } from "@/components/highlights/highlights-provider";
import { ManualCitationDialog } from "@/components/highlights/manual-citation-dialog";
import { SentencePickerDialog } from "@/components/highlights/sentence-picker-dialog";
import { isAlreadyHighlighted, passagesFrom, splitSentences } from "@/lib/sentences";
import { useFocusRecovery } from "@/hooks/use-focus-recovery";

interface Props {
  /** Barre latérale du lecteur : plus dense, et la page d'un surlignage fait défiler le PDF. */
  compact?: boolean;
  onGoToPage?: (page: number) => void;
  /** Ce qu'on peut surligner ici : le résumé de la fiche, le PDF dans le lecteur. Sans les deux, il reste la saisie à la main. */
  hasAbstract?: boolean;
  hasPdf?: boolean;
  /** Texte du résumé (fiche article) : ses phrases peuvent être surlignées sans sélection à la souris (A11Y-18). */
  abstract?: string;
  /** Langue du résumé (attribut `lang`). */
  lang?: string;
}

/** « Mes surlignages » pour un article : la liste, l'ajout à la main, le lien vers toutes les citations. */
export function ArticleHighlights({ compact = false, onGoToPage, hasAbstract = true, hasPdf = compact, abstract, lang }: Props) {
  const { enabled, retracted, highlights, add, updateNote, remove, requestSignIn } = useHighlights();
  const [manual, setManual] = useState(false);
  const [picker, setPicker] = useState(false);
  /** Passage supprimé sous le focus : « Supprimer » du suivant, sinon du précédent, sinon le titre (A11Y-19). */
  const headingRef = useRef<HTMLHeadingElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useFocusRecovery(listRef, ":scope > li", () => headingRef.current);
  const sentences = useMemo(() => (abstract && !compact ? splitSentences(abstract, lang ?? "fr") : []), [abstract, compact, lang]);
  const where = compact ? "du PDF" : hasAbstract && hasPdf ? "du résumé, ou du PDF dans le lecteur" : hasAbstract ? "du résumé" : hasPdf ? "du PDF dans le lecteur" : null;
  // Au clavier (ou quand la sélection est malaisée) : le bouton « Surligner des phrases » ouvre la liste des phrases.
  const keyboard = compact ? " Au clavier : « Surligner des phrases », au-dessus du PDF." : sentences.length > 0 ? " Au clavier : « Surligner des phrases du résumé »." : "";
  const howTo = where
    ? `Sélectionnez une phrase ${where} : un bouton « Surligner » apparaît.${keyboard}`
    : "Le résumé et le texte intégral ne sont pas disponibles ici : notez vos citations à la main en lisant l'article ailleurs.";

  const abstractHighlights = highlights.filter((h) => h.source === "abstract").map((h) => h.text);
  async function saveSentences(indexes: number[]) {
    if (!abstract) return false;
    let ok = true;
    for (const p of passagesFrom(abstract, sentences, indexes)) {
      ok = Boolean(await add({ source: "abstract", text: p.text, prefix: p.prefix, suffix: p.suffix, page: null, note: "" })) && ok;
    }
    return ok;
  }

  const addButton = (
    <div className="flex flex-wrap gap-2">
      {sentences.length > 0 && (
        <Button variant="outline" size="default" onClick={() => (enabled ? setPicker(true) : requestSignIn())} className="bg-card">
          <HighlighterIcon /> Surligner des phrases du résumé
        </Button>
      )}
      <Button variant="outline" size={compact ? "sm" : "default"} onClick={() => (enabled ? setManual(true) : requestSignIn())} className="bg-card">
        <PenLineIcon /> Ajouter une citation à la main
      </Button>
    </div>
  );

  return (
    <section id="mes-surlignages" aria-labelledby="mes-surlignages-titre" className={compact ? "" : "mt-8"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 ref={headingRef} id="mes-surlignages-titre" tabIndex={-1} className="flex items-center gap-2 text-sm outline-none font-semibold uppercase tracking-wide text-muted-foreground">
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
          <ul ref={listRef} className="mt-3 flex flex-col gap-2">
            {highlights.map((h) => (
              <HighlightItem key={h.id} highlight={h} retracted={retracted} onNote={(note) => updateNote(h.id, note)} onDelete={() => remove(h.id)} onGoToPage={onGoToPage} compact={compact} />
            ))}
          </ul>
          <div className="mt-3">{addButton}</div>
        </>
      )}
      <ManualCitationDialog open={manual} onOpenChange={setManual} />
      {sentences.length > 0 && (
        <SentencePickerDialog
          open={picker}
          onOpenChange={setPicker}
          title="Surligner des phrases"
          description="Cochez les phrases du résumé à garder : elles seront marquées dans le résumé et rangées dans « Mes citations », avec leur source."
          sentences={sentences}
          lang={lang}
          isHighlighted={(s) => isAlreadyHighlighted(s.text, abstractHighlights)}
          onSave={saveSentences}
        />
      )}
    </section>
  );
}
