"use client";

import { useMemo } from "react";
import { CheckIcon, CopyIcon, DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bibtexAll } from "@/lib/citation";
import { fileSlug, type FavoriteSnapshot } from "@/lib/favorites-shared";
import { useCopy } from "@/hooks/use-copy";

/** Export BibTeX d'une liste partagée : copier ou télécharger le .bib. `retracted` : vérifié côté serveur. */
export function SharedListActions({ name, articles, retracted = [] }: { name: string; articles: FavoriteSnapshot[]; retracted?: string[] }) {
  const { copied, copy: copyText } = useCopy();
  const retractedIds = useMemo(() => new Set(retracted), [retracted]);
  const bib = () => bibtexAll(articles, retractedIds);

  const copy = () => void copyText(bib(), { message: "BibTeX copié.", failure: "Presse-papiers indisponible." });

  function download() {
    const url = URL.createObjectURL(new Blob([bib()], { type: "application/x-bibtex;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `sextant-${fileSlug(name)}.bib`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" className="h-10 bg-card" onClick={copy} disabled={articles.length === 0}>{copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Copié" : "Copier BibTeX"}</Button>
      <Button variant="outline" className="h-10 bg-card" onClick={download} disabled={articles.length === 0}><DownloadIcon /> Télécharger .bib</Button>
    </div>
  );
}
