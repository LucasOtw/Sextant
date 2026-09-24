"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon, DownloadIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { bibtexAll, fileSlug, type FavoriteSnapshot } from "@/lib/favorites-shared";

/** Export BibTeX d'une liste partagée : copier ou télécharger le .bib. */
export function SharedListActions({ name, articles }: { name: string; articles: FavoriteSnapshot[] }) {
  const [copied, setCopied] = useState(false);
  const bib = () => bibtexAll(articles);

  async function copy() {
    try {
      await navigator.clipboard.writeText(bib());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Presse-papiers indisponible.");
    }
  }

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
