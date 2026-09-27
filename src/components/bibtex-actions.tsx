"use client";

import { useMemo } from "react";
import { CheckIcon, CopyIcon, DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bibtexAll } from "@/lib/citation";
import type { FavoriteSnapshot } from "@/lib/favorites-shared";
import { useCopy } from "@/hooks/use-copy";
import { cn } from "@/lib/cn";

interface Props {
  articles: FavoriteSnapshot[];
  /** Nom du fichier téléchargé (`sextant-….bib`). */
  filename: string;
  /** Identifiants rétractés, vérifiés côté serveur : `note = {Retracted}`. */
  retracted?: string[];
  /** Annonce après la copie. */
  copiedMessage?: string;
  className?: string;
  buttonClassName?: string;
}

/** Export BibTeX d'une liste d'articles (favoris, liste, liste partagée) : copier ou télécharger le .bib (QUAL-13). */
export function BibtexActions({ articles, filename, retracted = [], copiedMessage = "BibTeX copié.", className, buttonClassName }: Props) {
  const { copied, copy: copyText } = useCopy();
  const retractedIds = useMemo(() => new Set(retracted), [retracted]);
  const bib = () => bibtexAll(articles, retractedIds);

  const copy = () => void copyText(bib(), { message: copiedMessage, failure: "Presse-papiers indisponible." });

  function download() {
    const url = URL.createObjectURL(new Blob([bib()], { type: "application/x-bibtex;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <Button variant="outline" className={buttonClassName} onClick={copy} disabled={articles.length === 0}>{copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Copié" : "Copier BibTeX"}</Button>
      <Button variant="outline" className={buttonClassName} onClick={download} disabled={articles.length === 0}><DownloadIcon /> Télécharger .bib</Button>
    </div>
  );
}
