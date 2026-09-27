"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CopyIcon, SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HighlightItem } from "@/components/highlights/highlight-item";
import { ArticleMeta } from "@/components/article-card";
import { EmptyState } from "@/components/empty-state";
import { ShowMore, useRevealFocus } from "@/components/show-more";
import type { Collection } from "@/lib/collections-shared";
import { citationBlock, type Highlight } from "@/lib/highlights-shared";
import { countDistinct, filterFolded, foldedIndex, groupBy, nextPage, PAGE_SIZE, visibleCount, type PageState } from "@/lib/list-filter";
import { undoToast } from "@/lib/undo-toast";
import { api, errorMessage, needsSignIn } from "@/lib/client/api";
import { useFocusRecovery } from "@/hooks/use-focus-recovery";

interface Props {
  initial: Highlight[];
  collections: Collection[];
  loadError?: boolean;
  /** Articles rétractés (vérifiés côté serveur) : badge et mention dans les références copiées. */
  retracted?: string[];
}

/** Échec d'une modification : une session expirée le dit (plutôt que le « Non connecté. » brut de la route). */
function citationError(e: unknown, fallback: string): string {
  return needsSignIn(e) ? "Votre session a expiré : reconnectez-vous pour modifier vos citations." : errorMessage(e, fallback);
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
  // Citations remises dans l'ordre des groupes avant de couper la tranche : sinon (tri par date, articles mêlés) chaque
  // tranche compléterait des sections déjà affichées, au-dessus du bouton, et rien n'apparaîtrait sous lui. Ainsi, une
  // tranche prolonge la dernière section ou en ajoute de nouvelles en bas.
  const ordered = useMemo(() => groupBy(shown, (h) => h.workId).flat(), [shown]);
  const groups = useMemo(() => groupBy(ordered.slice(0, limit), (h) => h.workId), [ordered, limit]);
  const { containerRef, reveal } = useRevealFocus<HTMLDivElement>(":scope > section > ul > li");
  /** Citation supprimée sous le focus : « Supprimer » de la suivante, sinon de la précédente, sinon le compteur (A11Y-19). */
  const countRef = useRef<HTMLParagraphElement>(null);
  useFocusRecovery(containerRef, ":scope > section > ul > li", () => countRef.current);

  async function updateNote(id: string, note: string) {
    const previous = items.find((h) => h.id === id)?.note ?? "";
    setItems((prev) => prev.map((h) => (h.id === id ? { ...h, note } : h)));
    try {
      await api(`/api/highlights/${id}`, { method: "PATCH", json: { note } });
      return true;
    } catch (e) {
      setItems((prev) => prev.map((h) => (h.id === id ? { ...h, note: previous } : h)));
      toast.error(citationError(e, "La note n'a pas pu être enregistrée."));
      return false;
    }
  }

  async function restore(removed: Highlight) {
    try {
      const { text, page, note, source, prefix, suffix, article } = removed;
      const { highlight: created } = await api<{ highlight?: Highlight }>("/api/highlights", { method: "POST", json: { text, page, note, source, prefix, suffix, article } });
      if (!created) throw new Error();
      setItems((prev) => [created, ...prev]);
    } catch (e) {
      toast.error(citationError(e, "La citation n'a pas pu être rétablie."));
    }
  }

  async function remove(id: string) {
    const previous = items;
    const removed = previous.find((h) => h.id === id);
    setItems((prev) => prev.filter((h) => h.id !== id));
    try {
      await api(`/api/highlights/${id}`, { method: "DELETE" });
      if (removed) undoToast("Citation supprimée.", () => void restore(removed));
      else toast("Citation supprimée.");
      return true;
    } catch (e) {
      setItems(previous);
      toast.error(citationError(e, "La suppression a échoué."));
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
      <EmptyState
        title="Vos citations sont indisponibles pour le moment."
        hint="Le service de stockage ne répond pas. Vos citations sont intactes, réessayez dans un instant."
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        titleRef={countRef}
        focusableTitle
        title="Aucune citation pour l'instant."
        hint="Sur une fiche article, sélectionnez un passage du résumé ou du PDF : un bouton «&nbsp;Surligner&nbsp;» apparaît. Le passage est gardé ici, avec l'article, la page et la date."
        action={
          <Link href="/search" className="link mt-5 inline-flex items-center gap-2">
            <SearchIcon className="size-4" /> Lancer une recherche
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer mes citations…" aria-label="Filtrer mes citations" className="pl-9 text-base md:text-base" />
        </div>
        {collections.length > 0 && (
          <Select items={listItems} value={list} onValueChange={(v) => setList(String(v))}>
            <SelectTrigger className="sm:w-56" aria-label="Filtrer par liste"><SelectValue /></SelectTrigger>
            <SelectContent>{listItems.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <Button variant="outline" onClick={copyAll} disabled={shown.length === 0}><CopyIcon /> Tout copier</Button>
      </div>

      <p ref={countRef} tabIndex={-1} className="text-meta text-muted-foreground outline-none" aria-live="polite">
        {shown.length} citation{shown.length > 1 ? "s" : ""}{articleCount > 1 && <> dans {articleCount} articles</>}{q && <> pour «&nbsp;{q}&nbsp;»</>}
      </p>

      <div ref={containerRef} className="flex flex-col gap-8">
        {groups.map((group) => {
          const a = group[0].article;
          return (
            <section key={group[0].workId} aria-label={a.title}>
              {retractedIds.has(group[0].workId) && <Badge variant="destructive" className="mb-1.5">Rétracté</Badge>}
              <h2 className="title-display text-xl leading-snug">
                <Link href={`/article/${group[0].workId}`} className="hover:text-accent-brand">{a.title}</Link>
              </h2>
              <ArticleMeta authors={a.authors} venue={a.venue} year={a.year} className="mt-1" />
              <ul className="mt-3 flex flex-col gap-2">
                {group.map((h) => (
                  <HighlightItem key={h.id} highlight={h} retracted={retractedIds.has(h.workId)} onNote={(note) => updateNote(h.id, note)} onDelete={() => remove(h.id)} deferPaint />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <ShowMore
        shown={Math.min(limit, shown.length)}
        total={shown.length}
        feminine
        onMore={() => {
          reveal(Math.min(limit, shown.length));
          setPage((p) => nextPage(p, pageKey));
        }}
      />
    </div>
  );
}
