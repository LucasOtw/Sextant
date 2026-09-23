"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CopyIcon, DownloadIcon, FolderIcon, LockOpenIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, QuoteIcon, RefreshCwIcon, SearchIcon, Trash2Icon } from "lucide-react";
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
import { bibtexFromSnapshot, type Favorite } from "@/lib/favorites-shared";
import { formatCount, typeLabel } from "@/lib/format";
import { cn } from "cn";

const SORTS = [
  { value: "added", label: "Ajout récent" },
  { value: "year", label: "Année" },
  { value: "cited", label: "Citations" },
  { value: "title", label: "Titre" },
];

const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });

function fold(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** BibTeX de plusieurs références, clés rendues uniques (suffixe b, c, d… en cas de doublon). */
function bibtexAll(items: Favorite[]): string {
  const used = new Map<string, number>();
  return items
    .map((f) => {
      const entry = bibtexFromSnapshot(f);
      const m = entry.match(/^@\w+\{([^,]+),/);
      if (!m) return entry;
      const n = used.get(m[1]) ?? 0;
      used.set(m[1], n + 1);
      return n === 0 ? entry : entry.replace(m[1], `${m[1]}${String.fromCharCode(97 + n)}`);
    })
    .join("\n\n");
}

function slug(name: string) {
  return fold(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "liste";
}

interface Props {
  initial: Favorite[];
  /** Le serveur n'a pas pu lire les favoris : on l'affiche au lieu d'un faux « vide ». */
  loadError?: boolean;
  /** Liste sélectionnée à l'arrivée (paramètre ?liste=). */
  initialCollectionId?: string | null;
}

/** Favoris et listes : rendus avec la liste serveur, puis reflètent l'état client (ajouts, retraits, listes). */
export function FavoritesList({ initial, loadError = false, initialCollectionId = null }: Props) {
  const favorites = useFavorites();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("added");
  const [selected, setSelected] = useState<string | null>(initialCollectionId);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // À l'arrivée sur la page, on se réaligne avec le serveur (favoris posés depuis un autre appareil).
  useEffect(() => {
    void favorites.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une fois au montage
  }, []);

  const collection = favorites.collections.find((c) => c.id === selected) ?? null;
  // Une liste supprimée ailleurs ne peut pas rester sélectionnée.
  const effectiveSelected = collection ? selected : null;

  // Routage superficiel : l'URL reste partageable/rechargeable sans re-rendre la page côté serveur.
  function select(id: string | null) {
    setSelected(id);
    window.history.replaceState(null, "", id ? `${pathname}?liste=${id}` : pathname);
  }

  // Base = liste serveur ; une fois l'état client chargé : on retire ce qui a été décoché, on ajoute ce qui a été coché ici.
  const all = useMemo(() => {
    if (!favorites.ready) return initial;
    const kept = initial.filter((f) => favorites.has(f.id));
    const known = new Set(kept.map((f) => f.id));
    return [...kept, ...favorites.added.filter((f) => !known.has(f.id))];
  }, [initial, favorites]);

  const scoped = useMemo(() => (collection ? all.filter((f) => collection.articleIds.includes(f.id)) : all), [all, collection]);

  const shown = useMemo(() => {
    const nq = fold(q.trim());
    const filtered = nq ? scoped.filter((f) => fold(`${f.title} ${f.authors} ${f.venue ?? ""} ${f.topic ?? ""}`).includes(nq)) : scoped;
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
  }, [scoped, q, sort]);

  async function copyBibtex() {
    try {
      await navigator.clipboard.writeText(bibtexAll(shown));
      toast.success(`BibTeX copié : ${shown.length} référence${shown.length > 1 ? "s" : ""}.`);
    } catch {
      toast.error("Presse-papiers indisponible.");
    }
  }

  function downloadBibtex() {
    const blob = new Blob([bibtexAll(shown)], { type: "application/x-bibtex;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = collection ? `sextant-${slug(collection.name)}.bib` : "sextant-favoris.bib";
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
    <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Listes">
      <Chip active={!effectiveSelected} onClick={() => select(null)}>Tous <span className="text-muted-foreground">{all.length}</span></Chip>
      {favorites.collections.map((c) => (
        <Chip key={c.id} active={effectiveSelected === c.id} onClick={() => select(c.id)}>
          <FolderIcon className="size-3.5" aria-hidden /> {c.name} <span className="text-muted-foreground">{c.articleIds.length}</span>
        </Chip>
      ))}
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed px-3 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
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
        onSubmit={async (name) => {
          const created = await favorites.createCollection(name);
          if (created) select(created.id);
          return Boolean(created);
        }}
      />
      {collection && (
        <>
          <CollectionDialog
            open={renaming}
            onOpenChange={setRenaming}
            initialName={collection.name}
            title="Renommer la liste"
            submitLabel="Renommer"
            onSubmit={(name) => favorites.renameCollection(collection.id, name)}
          />
          <Dialog open={deleting} onOpenChange={setDeleting}>
            <DialogContent className="sm:max-w-sm">
              <DialogTitle className="title-display text-2xl">Supprimer « {collection.name} » ?</DialogTitle>
              <DialogDescription className="text-[15px] text-muted-foreground">
                La liste disparaît ; ses {collection.articleIds.length} article{collection.articleIds.length > 1 ? "s" : ""} restent dans vos favoris.
              </DialogDescription>
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDeleting(false)}>Annuler</Button>
                <Button
                  variant="destructive"
                  onClick={async () => {
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
      )}
    </>
  );

  if (all.length === 0 && favorites.collections.length === 0) {
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="title-display flex items-center gap-2 text-2xl">
            <FolderIcon className="size-5 text-accent-brand" aria-hidden /> {collection.name}
          </h2>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" aria-label="Actions sur la liste" />}>
              <MoreHorizontalIcon /> Liste
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setRenaming(true)}><PencilIcon /> Renommer</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}><Trash2Icon /> Supprimer la liste</DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={collection ? `Filtrer dans « ${collection.name} »…` : "Filtrer mes favoris…"} aria-label="Filtrer" className="h-10 pl-9 text-base md:text-base" />
        </div>
        <Select items={SORTS} value={sort} onValueChange={(v) => setSort(String(v))}>
          <SelectTrigger className="h-10! sm:w-48" aria-label="Trier"><SelectValue /></SelectTrigger>
          <SelectContent>{SORTS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button variant="outline" className="h-10" onClick={copyBibtex} disabled={shown.length === 0}><CopyIcon /> Copier BibTeX</Button>
          <Button variant="outline" className="h-10" onClick={downloadBibtex} disabled={shown.length === 0}><DownloadIcon /> Télécharger .bib</Button>
        </div>
      </div>

      <p className="text-[15px] text-muted-foreground" aria-live="polite">
        {shown.length} article{shown.length > 1 ? "s" : ""}{q && <> pour « {q} »</>}
      </p>

      {shown.length === 0 && collection && !q && (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="text-lg font-medium">Cette liste est vide.</p>
          <p className="mt-1 text-base text-muted-foreground">
            Depuis « Tous » ou une fiche article, l'icône dossier ajoute un article à « {collection.name} ».
          </p>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {shown.map((f, i) => (
          <li key={f.id} className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-400 motion-reduce:animate-none" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
            <article className="relative flex flex-col gap-2 rounded-xl bg-card p-4 pr-24 ring-1 ring-foreground/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-foreground/25 sm:p-5 sm:pr-28">
              <div className="absolute right-3 top-3 z-10 flex items-center gap-1">
                <CollectionPicker snapshot={f} />
                <FavoriteButton snapshot={f} initialActive />
              </div>
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
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><QuoteIcon className="size-4 text-accent-brand" aria-hidden />{formatCount(f.citedByCount)} citation{f.citedByCount > 1 ? "s" : ""}</span>
                {f.addedAt && <span>· ajouté le {DATE.format(new Date(f.addedAt))}</span>}
                {!collection && favorites.collections.some((c) => c.articleIds.includes(f.id)) && (
                  <span className="flex flex-wrap items-center gap-1">
                    ·{" "}
                    {favorites.collections.filter((c) => c.articleIds.includes(f.id)).map((c) => (
                      <button key={c.id} type="button" onClick={() => select(c.id)} className="relative z-10 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground hover:bg-accent">
                        {c.name}
                      </button>
                    ))}
                  </span>
                )}
              </div>
            </article>
          </li>
        ))}
      </ul>
      {dialogs}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm transition-colors",
        active ? "bg-primary text-primary-foreground" : "bg-card text-foreground ring-1 ring-foreground/10 hover:ring-foreground/25",
      )}
    >
      {children}
    </button>
  );
}
