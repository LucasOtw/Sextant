"use client";

import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon, CopyIcon, DownloadIcon, FolderIcon, Link2Icon, LockOpenIcon, PencilIcon, PlusIcon, QuoteIcon, RefreshCwIcon, SearchIcon, SettingsIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CollectionDialog } from "@/components/collections/collection-dialog";
import { CollectionPicker } from "@/components/collections/collection-picker";
import { FavoriteButton } from "@/components/favorites/favorite-button";
import { useFavorites } from "@/components/favorites/favorites-provider";
import type { Collection } from "@/lib/collections-shared";
import { bibtexAll, fileSlug, type Favorite } from "@/lib/favorites-shared";
import { ShareDialog } from "@/components/collections/share-dialog";
import { ShowMore, useRevealFocus } from "@/components/show-more";
import { formatCount, typeLabel } from "@/lib/format";
import { filterFolded, foldedIndex, nextPage, PAGE_SIZE, visibleCount, type PageState } from "@/lib/list-filter";
import { cn } from "cn";

const SORTS = [
  { value: "added", label: "Ajout récent" },
  { value: "list", label: "Ordre de la liste" },
  { value: "year", label: "Année" },
  { value: "cited", label: "Citations" },
  { value: "title", label: "Titre" },
];

const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });

/** Seules les premières cartes entrent en animation : au-delà, des centaines d'animations partiraient ensemble. */
const ANIMATED_ROWS = 12;
const NO_LISTS: Collection[] = [];

function deleteHint(n: number) {
  if (n === 0) return "La liste est vide : rien ne change dans vos favoris.";
  if (n === 1) return "Son article reste dans vos favoris.";
  return `Ses ${n} articles restent dans vos favoris.`;
}

interface Props {
  initial: Favorite[];
  /** Listes connues du rendu serveur : affichées sans attendre le chargement client. */
  initialCollections?: Collection[];
  /** Le serveur a bien lu les listes (pas un repli vide après une erreur) : elles font foi, sans relecture client. */
  collectionsFresh?: boolean;
  /** Le serveur n'a pas pu lire les favoris : on l'affiche au lieu d'un faux « vide ». */
  loadError?: boolean;
  /** Identifiants rétractés selon OpenAlex, vérifiés côté serveur à chaque visite (badge et mention dans le BibTeX). */
  retracted?: string[];
}

/**
 * Favoris et listes : rendus avec les données serveur, puis reflètent l'état client (ajouts, retraits, listes).
 * La liste sélectionnée vit dans l'URL (`?liste=id`) : partageable, rechargeable, et suivie par le bouton Retour.
 */
export function FavoritesList({ initial, initialCollections = [], collectionsFresh = false, loadError = false, retracted = [] }: Props) {
  const favorites = useFavorites();
  const retractedIds = useMemo(() => new Set(retracted), [retracted]);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("liste");
  const [q, setQ] = useState("");
  // La saisie reste fluide : filtre et tri suivent la frappe en priorité basse (PERF-11).
  const dq = useDeferredValue(q);
  const [page, setPage] = useState<PageState>({ key: "", n: PAGE_SIZE });
  const [sort, setSort] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const { loadCollections, updateCollection, ready, has, added } = favorites;

  // À l'arrivée sur la page, on se réaligne avec le serveur (favoris et listes posés depuis un autre appareil). Les
  // listes que le serveur vient de lire font foi : pas de seconde lecture côté client (PERF-10). Effet de mise en page,
  // exécuté avant les effets des sélecteurs de liste de chaque carte, qui sinon relanceraient la lecture des listes.
  useLayoutEffect(() => {
    void loadCollections(initialCollections, { fresh: collectionsFresh });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une fois au montage
  }, []);

  const collections = favorites.collectionsLoaded ? favorites.collections : initialCollections;
  const collection = collections.find((c) => c.id === selectedId) ?? null;
  // Par défaut : ordre manuel dans une liste, ajout récent dans « Tous » ; le choix explicite de l'utilisateur prime.
  const activeSort = sort ?? (collection ? "list" : "added");
  const sorts = collection ? SORTS : SORTS.filter((o) => o.value !== "list");
  const manualOrder = Boolean(collection) && activeSort === "list" && !dq.trim();

  // Une liste supprimée ailleurs ne peut pas rester dans l'URL (seulement une fois l'état serveur connu et sain).
  useEffect(() => {
    if (selectedId && favorites.ready && favorites.collectionsLoaded && !favorites.error && !collection) window.history.replaceState(null, "", pathname);
  }, [selectedId, favorites.ready, favorites.collectionsLoaded, favorites.error, collection, pathname]);

  // Routage superficiel : l'URL change sans re-rendre la page côté serveur, et `useSearchParams` suit.
  const select = useCallback(
    (id: string | null) => window.history.replaceState(null, "", id ? `${pathname}?liste=${id}` : pathname),
    [pathname],
  );

  // Base = liste serveur ; une fois l'état client chargé : on retire ce qui a été décoché, on ajoute ce qui a été coché ici.
  // Dépend des seuls morceaux d'état utiles (stables d'un rendu à l'autre), pas de tout le contexte (PERF-12).
  const all = useMemo(() => {
    if (!ready) return initial;
    const kept = initial.filter((f) => has(f.id));
    const known = new Set(kept.map((f) => f.id));
    return [...kept, ...added.filter((f) => !known.has(f.id))];
  }, [initial, ready, has, added]);

  const scoped = useMemo(() => {
    if (!collection) return all;
    const inList = new Set(collection.articleIds);
    return all.filter((f) => inList.has(f.id));
  }, [all, collection]);

  // Texte plié de chaque favori, calculé une fois par liste et non à chaque frappe.
  const index = useMemo(() => foldedIndex(all, (f) => `${f.title} ${f.authors} ${f.venue ?? ""} ${f.topic ?? ""}`), [all]);

  const shown = useMemo(() => {
    const sorted = filterFolded(scoped, index, dq);
    switch (activeSort) {
      case "list": {
        const rank = new Map((collection?.articleIds ?? []).map((id, i) => [id, i]));
        sorted.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
        break;
      }
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
  }, [scoped, index, dq, activeSort, collection]);

  // Rendu par tranches : seules les premières cartes sont montées ; compteur et exports BibTeX portent sur toutes.
  const pageKey = `${dq}|${selectedId ?? ""}|${activeSort}`;
  const limit = visibleCount(page, pageKey);

  const { containerRef: listRef, reveal } = useRevealFocus<HTMLUListElement>(":scope > li");
  /** Carte déplacée au clavier : son bouton reprend le focus après le nouveau rendu (voir l'effet plus bas). */
  const moved = useRef<{ id: string; delta: -1 | 1 } | null>(null);

  /** Déplace un article d'un cran dans l'ordre de la liste. */
  const move = useCallback(
    (id: string, delta: -1 | 1) => {
      if (!collection) return;
      const ids = [...collection.articleIds];
      const i = ids.indexOf(id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      // Dernière carte de la tranche descendue d'un cran : la tranche s'agrandit, sinon la carte (qui a le focus)
      // sortirait de l'écran, démontée.
      const pos = shown.findIndex((f) => f.id === id);
      if (delta === 1 && pos >= 0 && pos + 1 >= limit) setPage((p) => nextPage(p, pageKey));
      moved.current = { id, delta };
      void updateCollection(collection.id, { articleIds: ids });
    },
    [collection, updateCollection, shown, limit, pageKey],
  );

  // Après un déplacement, le focus revient sur le bouton de la carte déplacée (sur l'autre flèche si elle a atteint un
  // bout de la liste), où qu'il soit tombé pendant le réordonnancement.
  useLayoutEffect(() => {
    const m = moved.current;
    if (!m) return;
    moved.current = null;
    const row = listRef.current?.querySelector<HTMLElement>(`:scope > li[data-id="${m.id}"]`);
    if (!row || row.contains(document.activeElement)) return;
    const buttons = row.querySelectorAll<HTMLButtonElement>("button[data-move]");
    const same = [...buttons].find((b) => b.dataset.move === (m.delta === 1 ? "down" : "up") && !b.disabled);
    (same ?? [...buttons].find((b) => !b.disabled))?.focus();
  });

  async function copyBibtex() {
    try {
      await navigator.clipboard.writeText(bibtexAll(shown, retractedIds));
      toast.success(`BibTeX copié : ${shown.length} référence${shown.length > 1 ? "s" : ""}.`);
    } catch {
      toast.error("Presse-papiers indisponible.");
    }
  }

  function downloadBibtex() {
    const blob = new Blob([bibtexAll(shown, retractedIds)], { type: "application/x-bibtex;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = collection ? `sextant-${fileSlug(collection.name)}.bib` : "sextant-favoris.bib";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  if (loadError && !favorites.ready) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="text-lg font-medium">Vos favoris sont indisponibles pour le moment.</p>
        <p className="mt-1 text-base text-muted-foreground">Le service de stockage ne répond pas. Vos favoris sont intacts, réessayez dans un instant.</p>
        <Button variant="outline" className="mt-5" onClick={() => void favorites.refresh()}><RefreshCwIcon /> Réessayer</Button>
      </div>
    );
  }

  const chips = (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Listes">
      <Chip active={!collection} onClick={() => select(null)} count={all.length}>Tous</Chip>
      {collections.map((c) => (
        <Chip key={c.id} active={collection?.id === c.id} onClick={() => select(c.id)} count={c.articleIds.length} icon shared={Boolean(c.shareToken)}>
          {c.name}
        </Chip>
      ))}
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-dashed px-3 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
      >
        <PlusIcon className="size-3.5" aria-hidden /> Nouvelle liste
      </button>
    </div>
  );

  const dialogs = (
    <>
      <CollectionDialog
        open={creating}
        onOpenChange={setCreating}
        title="Nouvelle liste"
        description="Par exemple « Mémoire 2026 », « Santé », « À lire »."
        submitLabel="Créer"
        onSubmit={async (name, description) => {
          const created = await favorites.createCollection(name, { description });
          if (created) select(created.id);
          return Boolean(created);
        }}
      />
      <CollectionDialog
        open={renaming && Boolean(collection)}
        onOpenChange={setRenaming}
        initialName={collection?.name ?? ""}
        initialDescription={collection?.description ?? ""}
        title="Modifier la liste"
        submitLabel="Enregistrer"
        onSubmit={(name, description) => (collection ? favorites.updateCollection(collection.id, { name, description }) : Promise.resolve(false))}
      />
      {collection && <ShareDialog open={sharing} onOpenChange={setSharing} collection={collection} />}
      <Dialog open={deleting && Boolean(collection)} onOpenChange={setDeleting}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle className="title-display text-2xl">Supprimer « {collection?.name} » ?</DialogTitle>
          <DialogDescription className="text-[15px] text-muted-foreground">
            {deleteHint(collection?.articleIds.length ?? 0)}{collection?.shareToken && " Son lien de partage cessera de fonctionner."}
          </DialogDescription>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleting(false)}>Annuler</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!collection) return;
                const id = collection.id;
                setDeleting(false);
                if (await favorites.deleteCollection(id)) select(null);
              }}
            >
              <Trash2Icon /> Supprimer la liste
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );

  if (all.length === 0 && collections.length === 0) {
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
    <div className="flex flex-col gap-5">
      {chips}

      {collection && (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="title-display flex min-w-0 items-center gap-2 text-2xl">
              <FolderIcon className="size-5 shrink-0 text-accent-brand" aria-hidden /> <span className="min-w-0 line-clamp-2 wrap-break-word">{collection.name}</span>
            </h2>
            {collection.description && <p className="mt-1 text-[15px] text-muted-foreground">{collection.description}</p>}
            {collection.shareToken && (
              <button type="button" onClick={() => setSharing(true)} className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-accent-brand underline underline-offset-3">
                <Link2Icon className="size-3.5" aria-hidden /> Partagée par lien
              </button>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="lg" aria-label="Renommer ou supprimer la liste" />}>
              <SettingsIcon /> Gérer
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setRenaming(true)}><PencilIcon /> Nom et description</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSharing(true)}><Link2Icon /> {collection.shareToken ? "Lien de partage" : "Partager par lien"}</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}><Trash2Icon /> Supprimer la liste</DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={collection ? `Filtrer dans « ${collection.name} »…` : "Filtrer mes favoris…"}
            aria-label={collection ? `Filtrer dans la liste ${collection.name}` : "Filtrer mes favoris"}
            className="h-10 pl-9 text-base md:text-base"
          />
        </div>
        <Select items={sorts} value={activeSort} onValueChange={(v) => setSort(String(v))}>
          <SelectTrigger className="h-10! sm:w-48" aria-label="Trier"><SelectValue /></SelectTrigger>
          <SelectContent>{sorts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button variant="outline" className="h-10" onClick={copyBibtex} disabled={shown.length === 0}><CopyIcon /> Copier BibTeX</Button>
          <Button variant="outline" className="h-10" onClick={downloadBibtex} disabled={shown.length === 0}><DownloadIcon /> Télécharger .bib</Button>
        </div>
      </div>

      <p className="text-[15px] text-muted-foreground" aria-live="polite">
        {shown.length} article{shown.length > 1 ? "s" : ""}{q && <> pour « {q} »</>}
        {manualOrder && shown.length > 1 && <> · les flèches changent l'ordre de la liste</>}
      </p>

      {shown.length === 0 && collection && !q && (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="text-lg font-medium">Cette liste est vide.</p>
          <p className="mt-1 text-base text-muted-foreground">
            Depuis « Tous » ou une fiche article, l'icône dossier range un article dans « {collection.name} ».
          </p>
        </div>
      )}

      <ul ref={listRef} className="flex flex-col gap-3">
        {shown.slice(0, limit).map((f, i) => (
          <FavoriteRow
            key={f.id}
            favorite={f}
            index={i}
            isLast={i === shown.length - 1}
            manualOrder={manualOrder}
            lists={collection ? NO_LISTS : favorites.listsOf(f.id)}
            retracted={retractedIds.has(f.id)}
            onSelect={select}
            onMove={move}
          />
        ))}
      </ul>
      <ShowMore
        shown={Math.min(limit, shown.length)}
        total={shown.length}
        onMore={() => {
          reveal(Math.min(limit, shown.length));
          setPage((p) => nextPage(p, pageKey));
        }}
      />
      {dialogs}
    </div>
  );
}

interface RowProps {
  favorite: Favorite;
  index: number;
  isLast: boolean;
  manualOrder: boolean;
  /** Listes qui contiennent l'article (tableau stable tant que les listes ne changent pas). */
  lists: Collection[];
  retracted: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, delta: -1 | 1) => void;
}

/**
 * Une carte de /favoris. Mémoïsée : un clic sur un cœur ou un retour sur l'onglet ne re-rend que les cœurs et les
 * sélecteurs de liste (abonnés au contexte), pas le reste de chaque carte (PERF-12).
 */
const FavoriteRow = memo(function FavoriteRow({ favorite: f, index: i, isLast, manualOrder, lists, retracted, onSelect, onMove }: RowProps) {
  const animated = i < ANIMATED_ROWS;
  return (
    <li
      data-id={f.id}
      className={cn(animated && "animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-400 motion-reduce:animate-none")}
      style={animated ? { animationDelay: `${Math.min(i, 8) * 40}ms` } : undefined}
    >
      <article
        className={cn(
          "relative flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-all duration-200 [contain-intrinsic-size:auto_180px] [content-visibility:auto] hover:-translate-y-0.5 hover:shadow-md hover:ring-foreground/25 sm:p-5",
          manualOrder ? "pr-44 sm:pr-48" : "pr-24 sm:pr-28",
        )}
      >
        <div className="absolute right-3 top-3 z-10 flex items-center gap-1">
          {manualOrder && (
            <>
              <Button variant="ghost" size="icon" className="size-9 rounded-full sm:size-8" aria-label="Monter dans la liste" data-move="up" disabled={i === 0} onClick={() => onMove(f.id, -1)}><ArrowUpIcon /></Button>
              <Button variant="ghost" size="icon" className="size-9 rounded-full sm:size-8" aria-label="Descendre dans la liste" data-move="down" disabled={isLast} onClick={() => onMove(f.id, 1)}><ArrowDownIcon /></Button>
            </>
          )}
          <CollectionPicker snapshot={f} />
          <FavoriteButton snapshot={f} initialActive />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <Badge variant="secondary">{typeLabel(f.type)}</Badge>
          {f.isOa && <Badge className="bg-oa text-oa-foreground"><LockOpenIcon aria-hidden /> Accès ouvert</Badge>}
          {retracted && <Badge variant="destructive">Rétracté</Badge>}
          {f.topic && <span className="truncate">· {f.topic}</span>}
        </div>
        <h3 className="title-display text-xl leading-snug">
          <Link href={`/article/${f.id}`} className="after:absolute after:inset-0 hover:text-accent-brand">{f.title}</Link>
        </h3>
        <p className="text-[15px] text-muted-foreground">
          {f.authors}{f.venue && <> · <span className="italic">{f.venue}</span></>}{f.year && <> · {f.year}</>}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1"><QuoteIcon className="size-4 text-accent-brand" aria-hidden />{formatCount(f.citedByCount)} citation{f.citedByCount > 1 ? "s" : ""}</span>
          {f.addedAt && <span>· ajouté le {DATE.format(new Date(f.addedAt))}</span>}
          {lists.length > 0 && (
            <span className="flex flex-wrap items-center gap-1.5">
              ·{" "}
              {lists.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelect(c.id)}
                  aria-label={`Ouvrir la liste ${c.name}`}
                  className="relative z-10 inline-flex min-h-7 max-w-48 items-center truncate rounded-full bg-secondary px-2.5 text-xs text-secondary-foreground transition-shadow hover:ring-1 hover:ring-foreground/25"
                >
                  {c.name}
                </button>
              ))}
            </span>
          )}
        </div>
      </article>
    </li>
  );
});

function Chip({ active, onClick, count, icon = false, shared = false, children }: { active: boolean; onClick: () => void; count: number; icon?: boolean; shared?: boolean; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      title={children}
      className={cn(
        "inline-flex h-9 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm transition-colors",
        active ? "bg-primary text-primary-foreground" : "bg-card text-foreground ring-1 ring-foreground/10 hover:ring-foreground/25",
      )}
    >
      {icon && <FolderIcon className="size-3.5 shrink-0" aria-hidden />}
      <span className="truncate">{children}</span>
      {shared && <Link2Icon className="size-3.5 shrink-0" aria-label="partagée par lien" />}
      <span className={active ? "text-primary-foreground/75" : "text-muted-foreground"}>{count}</span>
    </button>
  );
}
