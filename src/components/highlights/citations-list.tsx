"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { CopyIcon, SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HighlightItem } from "@/components/highlights/highlight-item";
import { ShowMore } from "@/components/show-more";
import type { Collection } from "@/lib/collections-shared";
import { citationBlock, type Highlight } from "@/lib/highlights-shared";
import { countDistinct, filterFolded, foldedIndex, groupBy, nextPage, PAGE_SIZE, visibleCount, type PageState } from "@/lib/list-filter";

interface Props {
  initial: Highlight[];
  collections: Collection[];
  loadError?: boolean;
  /** Articles rétractés (vérifiés côté serveur) : badge et mention dans les références copiées. */
  retracted?: string[];
}

async function jsonOrError(res: Response) {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Échec.");
}

const ALL = "__all__";

/** Toutes les citations, groupées par article, filtrables par liste et par texte. */
export function CitationsList({ initial, collections, loadError = false, retracted = [] }: Props) {
  const [items, setItems] = useState(initial);
  const retractedIds = useMemo(() => new Set(retracted), [retracted]);
  const [q, setQ] = useState("");
  const [list, setList] = useState(ALL);
  // La saisie reste fluide : le filtre suit la frappe en priorité basse (PERF-11).
  const dq = useDeferredValue(q);
  const [page, setPage] = useState<PageState>({ key: "", n: PAGE_SIZE });

  const listItems = useMemo(() => [{ value: ALL, label: "Toutes les listes" }, ...collections.map((c) => ({ value: c.id, label: c.name }))], [collections]);

  // Texte plié de chaque citation, calculé une fois par liste et non à chaque frappe.
  const index = useMemo(() => foldedIndex(items, (h) => `${h.text} ${h.note} ${h.article.title} ${h.article.authors}`), [items]);

  const shown = useMemo(() => {
    const inList = list === ALL ? null : new Set(collections.find((c) => c.id === list)?.articleIds ?? []);
    const matching = filterFolded(items, index, dq);
    return inList ? matching.filter((h) => inList.has(h.workId)) : matching;
  }, [items, index, dq, list, collections]);

  // Rendu par tranches : seules les premières citations sont montées ; compteur et « Tout copier » portent sur toutes.
  const pageKey = `${dq}|${list}`;
  const limit = visibleCount(page, pageKey);
  const articleCount = useMemo(() => countDistinct(shown, (h) => h.workId), [shown]);
  const groups = useMemo(() => groupBy(shown.slice(0, limit), (h) => h.workId), [shown, limit]);

  async function updateNote(id: string, note: string) {
    const previous = items.find((h) => h.id === id)?.note ?? "";
    setItems((prev) => prev.map((h) => (h.id === id ? { ...h, note } : h)));
    try {
      await jsonOrError(await fetch(`/api/highlights/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ note }) }));
      return true;
    } catch (e) {
      setItems((prev) => prev.map((h) => (h.id === id ? { ...h, note: previous } : h)));
      toast.error(e instanceof Error ? e.message : "La note n'a pas pu être enregistrée.");
      return false;
    }
  }

  async function restore(removed: Highlight) {
    try {
      const res = await fetch("/api/highlights", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: removed.text, page: removed.page, note: removed.note, source: removed.source, prefix: removed.prefix, suffix: removed.suffix, article: removed.article }) });
      const data = (await res.json().catch(() => ({}))) as { highlight?: Highlight; error?: string };
      if (!res.ok || !data.highlight) throw new Error(data.error ?? "Échec.");
      const created = data.highlight;
      setItems((prev) => [created, ...prev]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "La citation n'a pas pu être rétablie.");
    }
  }

  async function remove(id: string) {
    const previous = items;
    const removed = previous.find((h) => h.id === id);
    setItems((prev) => prev.filter((h) => h.id !== id));
    try {
      await jsonOrError(await fetch(`/api/highlights/${id}`, { method: "DELETE" }));
      toast("Citation supprimée.", removed ? { action: { label: "Annuler", onClick: () => void restore(removed) } } : undefined);
      return true;
    } catch (e) {
      setItems(previous);
      toast.error(e instanceof Error ? e.message : "La suppression a échoué.");
      return false;
    }
  }

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(shown.map((h) => citationBlock(h, retractedIds.has(h.workId))).join("\n\n---\n\n"));
      toast.success(shown.length > 1 ? `${shown.length} citations copiées avec leurs références.` : "Citation copiée avec sa référence.");
    } catch {
      toast.error("Presse-papiers indisponible.");
    }
  }

  if (loadError && items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="text-lg font-medium">Vos citations sont indisponibles pour le moment.</p>
        <p className="mt-1 text-base text-muted-foreground">Le service de stockage ne répond pas. Vos citations sont intactes, réessayez dans un instant.</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="text-lg font-medium">Aucune citation pour l'instant.</p>
        <p className="mt-1 text-base text-muted-foreground">
          Sur une fiche article, sélectionnez un passage du résumé ou du PDF : un bouton « Surligner » apparaît. Le passage est gardé ici, avec l'article, la page et la date.
        </p>
        <Link href="/search" className="mt-5 inline-flex items-center gap-2 text-accent-brand underline underline-offset-3">
          <SearchIcon className="size-4" /> Lancer une recherche
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer mes citations…" aria-label="Filtrer mes citations" className="h-10 pl-9 text-base md:text-base" />
        </div>
        {collections.length > 0 && (
          <Select items={listItems} value={list} onValueChange={(v) => setList(String(v))}>
            <SelectTrigger className="h-10! sm:w-56" aria-label="Filtrer par liste"><SelectValue /></SelectTrigger>
            <SelectContent>{listItems.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <Button variant="outline" className="h-10" onClick={copyAll} disabled={shown.length === 0}><CopyIcon /> Tout copier</Button>
      </div>

      <p className="text-[15px] text-muted-foreground" aria-live="polite">
        {shown.length} citation{shown.length > 1 ? "s" : ""}{articleCount > 1 && <> · {articleCount} articles</>}{q && <> pour « {q} »</>}
      </p>

      <div className="flex flex-col gap-8">
        {groups.map((group) => {
          const a = group[0].article;
          return (
            <section key={group[0].workId} aria-label={a.title}>
              {retractedIds.has(group[0].workId) && <Badge variant="destructive" className="mb-1.5">Rétracté</Badge>}
              <h2 className="title-display text-xl leading-snug">
                <Link href={`/article/${group[0].workId}`} className="hover:text-accent-brand">{a.title}</Link>
              </h2>
              <p className="mt-1 text-[15px] text-muted-foreground">
                {a.authors}{a.venue && <> · <span className="italic">{a.venue}</span></>}{a.year && <> · {a.year}</>}
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {group.map((h) => (
                  <HighlightItem key={h.id} highlight={h} retracted={retractedIds.has(h.workId)} onNote={(note) => updateNote(h.id, note)} onDelete={() => remove(h.id)} deferPaint />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <ShowMore shown={Math.min(limit, shown.length)} total={shown.length} onMore={() => setPage((p) => nextPage(p, pageKey))} />
    </div>
  );
}
