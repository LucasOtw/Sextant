"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CopyIcon, DownloadIcon, LockOpenIcon, QuoteIcon, SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FavoriteButton } from "@/components/favorites/favorite-button";
import { useFavorites } from "@/components/favorites/favorites-provider";
import { bibtexFromSnapshot, type Favorite } from "@/lib/favorites-shared";
import { formatCount, typeLabel } from "@/lib/format";

const SORTS = [
  { value: "added", label: "Ajout récent" },
  { value: "year", label: "Année" },
  { value: "cited", label: "Citations" },
  { value: "title", label: "Titre" },
];

function fold(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Liste des favoris : recherche, tri, retrait, export BibTeX. Rendue avec la liste serveur, puis suit l'état client. */
export function FavoritesList({ initial }: { initial: Favorite[] }) {
  const favorites = useFavorites();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("added");

  // La liste serveur sert de base ; dès que l'état client est chargé, un cœur décoché retire l'article.
  const list = useMemo(() => (favorites.ready ? initial.filter((f) => favorites.has(f.id)) : initial), [initial, favorites]);

  const shown = useMemo(() => {
    const nq = fold(q.trim());
    const filtered = nq ? list.filter((f) => fold(`${f.title} ${f.authors} ${f.venue ?? ""} ${f.topic ?? ""}`).includes(nq)) : list;
    const sorted = [...filtered];
    switch (sort) {
      case "year":
        sorted.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
        break;
      case "cited":
        sorted.sort((a, b) => b.citedByCount - a.citedByCount);
        break;
      case "title":
        sorted.sort((a, b) => a.title.localeCompare(b.title, "fr"));
        break;
      default:
        sorted.sort((a, b) => (b.addedAt ?? "").localeCompare(a.addedAt ?? ""));
    }
    return sorted;
  }, [list, q, sort]);

  const bibtex = () => shown.map(bibtexFromSnapshot).join("\n\n");

  async function copyBibtex() {
    try {
      await navigator.clipboard.writeText(bibtex());
      toast.success(`BibTeX copié (${shown.length} référence${shown.length > 1 ? "s" : ""}).`);
    } catch {
      toast.error("Presse-papiers indisponible.");
    }
  }

  function downloadBibtex() {
    const blob = new Blob([bibtex()], { type: "application/x-bibtex;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sextant-favoris.bib";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (list.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="text-lg font-medium">Aucun favori pour l'instant.</p>
        <p className="mt-1 text-base text-muted-foreground">
          Le cœur sur une carte ou une fiche article l'enregistre ici, retrouvable sur tous vos appareils.
        </p>
        <Link href="/search" className="mt-5 inline-flex items-center gap-2 text-accent-brand underline underline-offset-3">
          <SearchIcon className="size-4" /> Lancer une recherche
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer mes favoris…" aria-label="Filtrer mes favoris" className="h-10 pl-9 text-base md:text-base" />
        </div>
        <Select items={SORTS} value={sort} onValueChange={(v) => setSort(String(v))}>
          <SelectTrigger className="h-10 sm:w-48" aria-label="Trier"><SelectValue /></SelectTrigger>
          <SelectContent>{SORTS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button variant="outline" className="h-10" onClick={copyBibtex} disabled={shown.length === 0}><CopyIcon /> BibTeX</Button>
          <Button variant="outline" className="h-10" onClick={downloadBibtex} disabled={shown.length === 0} aria-label="Télécharger le fichier BibTeX"><DownloadIcon /> .bib</Button>
        </div>
      </div>

      <p className="text-[15px] text-muted-foreground">
        {shown.length} article{shown.length > 1 ? "s" : ""}{q && <> pour « {q} »</>}
      </p>

      <ul className="flex flex-col gap-3">
        {shown.map((f, i) => (
          <li key={f.id} className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-400 motion-reduce:animate-none" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
            <article className="relative flex flex-col gap-2 rounded-xl bg-card p-4 pr-14 ring-1 ring-foreground/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-foreground/25 sm:p-5 sm:pr-16">
              <div className="absolute right-3 top-3 z-10"><FavoriteButton snapshot={f} /></div>
              <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                <Badge variant="secondary">{typeLabel(f.type)}</Badge>
                {f.isOa && <Badge className="bg-oa text-oa-foreground"><LockOpenIcon aria-hidden /> Accès ouvert</Badge>}
                {f.topic && <span className="truncate">· {f.topic}</span>}
              </div>
              <h3 className="title-display text-xl leading-snug">
                <Link href={`/article/${f.id}`} className="after:absolute after:inset-0 hover:text-accent-brand">{f.title}</Link>
              </h3>
              <p className="text-[15px] text-muted-foreground">
                {f.authors}{f.venue && <> · <span className="italic">{f.venue}</span></>}{f.year && <> · {f.year}</>}
              </p>
              <div className="flex items-center gap-3 pt-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><QuoteIcon className="size-4 text-accent-brand" aria-hidden />{formatCount(f.citedByCount)} citation{f.citedByCount > 1 ? "s" : ""}</span>
                {f.addedAt && <span>· ajouté le {new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(f.addedAt))}</span>}
              </div>
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}
