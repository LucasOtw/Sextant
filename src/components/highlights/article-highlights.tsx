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
import { cn } from "cn";

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
  const { enabled, retracted, highlights, addMany, updateNote, remove, requestSignIn } = useHighlights();
  const [manual, setManual] = useState(false);
  const [picker, setPicker] = useState(false);
  /** Passage supprimé sous le focus : « Supprimer » du suivant, sinon du précédent, sinon le titre (A11Y-19). */
  const headingRef = useRef<HTMLHeadingElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useFocusRecovery(listRef, ":scope > li", () => headingRef.current);
  const sentences = useMemo(() => (abstract && !compact ? splitSentences(abstract, lang ?? "fr") : []), [abstract, compact, lang]);
  const where = compact ? "du PDF" : hasAbstract && hasPdf ? "du résumé, ou du PDF dans le lecteur" : hasAbstract ? "du résumé" : hasPdf ? "du PDF dans le lecteur" : null;
  // Au clavier (ou quand la sélection est malaisée) : le bouton « Surligner des phrases » ouvre la liste des phrases.
  const keyboard = compact ? " Au clavier : «\u00A0Surligner des phrases\u00A0», au-dessus du PDF." : sentences.length > 0 ? " Au clavier : «\u00A0Surligner des phrases du résumé\u00A0»." : "";
  const howTo = where
    ? `Sélectionnez une phrase ${where} : un bouton «\u00A0Surligner\u00A0» apparaît.${keyboard}`
    : "Le résumé et le texte intégral ne sont pas disponibles ici : notez vos citations à la main en lisant l'article ailleurs.";

  const abstractHighlights = highlights.filter((h) => h.source === "abstract").map((h) => h.text);
  async function saveSentences(indexes: number[]) {
    if (!abstract) return { ok: false };
    // Un seul toast pour le lot (« 2 passages surlignés. »), pas un par passage.
    return addMany(passagesFrom(abstract, sentences, indexes).map((p) => ({ source: "abstract", text: p.text, prefix: p.prefix, suffix: p.suffix, page: null, note: "" })));
  }

  const addButton = (
    <div className="flex flex-wrap gap-2">
      {sentences.length > 0 && (
        <Button variant="outline" size="default" onClick={() => (enabled ? setPicker(true) : requestSignIn())}>
          <HighlighterIcon /> Surligner des phrases du résumé
        </Button>
      )}
      <Button variant="outline" size={compact ? "sm" : "default"} onClick={() => (enabled ? setManual(true) : requestSignIn())}>
        <PenLineIcon /> Ajouter une citation à la main
      </Button>
    </div>
  );

  return (
    <section id="mes-surlignages" aria-labelledby="mes-surlignages-titre" className={compact ? "" : "mt-8"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 ref={headingRef} id="mes-surlignages-titre" tabIndex={-1} className="section-title flex items-center gap-2 outline-none">
          <HighlighterIcon className="size-5 text-highlight-foreground" aria-hidden /> Mes surlignages
          {highlights.length > 0 && <span className="rounded-full bg-secondary px-2 py-0.5 font-sans text-xs font-semibold text-secondary-foreground">{highlights.length}</span>}
        </h2>
        {enabled && highlights.length > 0 && (
          <Link href="/citations" className="link text-sm">Toutes mes citations</Link>
        )}
      </div>

      {!enabled ? (
        <p className="mt-2 max-w-measure-text text-meta text-muted-foreground">
          {where ? `Sélectionnez un passage ${where} pour le surligner, ou notez une citation à la main.` : "Notez vos citations à la main : le résumé et le texte intégral ne sont pas disponibles ici."} Elles sont gardées avec leur source, sur tous vos appareils.{" "}
          <Button variant="link" size="inline" onClick={requestSignIn}>Se connecter</Button>
        </p>
      ) : (
        <>
          {highlights.length > 0 && (
            <ul ref={listRef} className="mt-3 flex flex-col gap-2">
              {highlights.map((h) => (
                <HighlightItem key={h.id} highlight={h} retracted={retracted} lang={lang} onNote={(note) => updateNote(h.id, note)} onDelete={() => remove(h.id)} onGoToPage={onGoToPage} compact={compact} />
              ))}
            </ul>
          )}
          {/* Même élément, à la même place, avec ou sans passage : au premier surlignage, les boutons ne sont pas
              remplacés et la fenêtre qui se ferme leur rend le focus (sinon il tomberait sur <body>). */}
          <div className={cn("mt-3", highlights.length === 0 && "flex flex-col items-start gap-3 surface-tint rounded-2xl p-4 text-meta text-muted-foreground")}>
            {highlights.length === 0 && <p className="flex items-start gap-2"><QuoteIcon className="mt-0.5 size-4 shrink-0" aria-hidden /> Aucun passage retenu pour cet article. {howTo}</p>}
            {addButton}
          </div>
        </>
      )}
      <ManualCitationDialog open={manual} onOpenChange={setManual} />
      {sentences.length > 0 && (
        <SentencePickerDialog
          open={picker}
          onOpenChange={setPicker}
          title="Surligner des phrases"
          description="Cochez les phrases du résumé à garder : elles seront marquées dans le résumé et rangées dans «&nbsp;Mes citations&nbsp;», avec leur source."
          sentences={sentences}
          lang={lang}
          isHighlighted={(s) => isAlreadyHighlighted(s.text, abstractHighlights)}
          onSave={saveSentences}
        />
      )}
    </section>
  );
}
