"use client";

import { useEffect, useState } from "react";
import { FolderCheckIcon, FolderIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SignInDialog } from "@/components/auth/sign-in-dialog";
import { CollectionDialog } from "@/components/collections/collection-dialog";
import { useFavorites } from "@/components/favorites/favorites-provider";
import type { FavoriteSnapshot } from "@/lib/favorites-shared";
import { cn } from "cn";

interface Props {
  snapshot: FavoriteSnapshot;
  /** `icon` : dossier seul (cartes, liste) ; `button` : dossier + libellé (fiche article). */
  variant?: "icon" | "button";
  className?: string;
}

/** « Ajouter à une liste » : cases à cocher par liste, plus la création d'une nouvelle liste. */
export function CollectionPicker({ snapshot, variant = "icon", className }: Props) {
  const favorites = useFavorites();
  const [creating, setCreating] = useState(false);
  const [signIn, setSignIn] = useState(false);
  const { enabled, loadCollections } = favorites;

  // Les listes ne sont chargées que là où on les montre.
  useEffect(() => {
    if (enabled) void loadCollections();
  }, [enabled, loadCollections]);

  const inLists = favorites.listsOf(snapshot.id).length;
  const status = inLists ? `Dans ${inLists} liste${inLists > 1 ? "s" : ""}` : "Ajouter à une liste";
  const label = inLists ? `${status}, modifier` : status;
  const Icon = inLists ? FolderCheckIcon : FolderIcon;

  const trigger =
    variant === "icon" ? (
      <Button variant="ghost" size="icon" aria-label={label} title={label} className={cn("size-10 rounded-full bg-card/80 hover:bg-card sm:size-9", className)}>
        <Icon className={cn("size-[18px]", inLists ? "text-accent-brand" : "text-muted-foreground")} />
      </Button>
    ) : (
      <Button variant="outline" size="lg" className={cn("bg-card", className)} aria-label={label}>
        <Icon className={inLists ? "text-accent-brand" : undefined} />
        {status}
      </Button>
    );

  if (!enabled) {
    return (
      <>
        <span onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSignIn(true); }} className="contents">{trigger}</span>
        {signIn && <SignInDialog open={signIn} onOpenChange={setSignIn} intro="Connectez-vous pour organiser vos articles en listes." />}
      </>
    );
  }

  const placeholder = !favorites.collectionsLoaded
    ? favorites.error ? "Listes indisponibles pour le moment." : "Chargement…"
    : favorites.collections.length === 0 ? "Aucune liste pour l'instant." : null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={trigger} onClick={(e) => e.stopPropagation()} />
        <DropdownMenuContent align="end" className="w-64" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Mes listes</DropdownMenuLabel>
            {placeholder && <DropdownMenuItem disabled className="text-muted-foreground">{placeholder}</DropdownMenuItem>}
            {favorites.collections.map((c) => {
              const checked = c.articleIds.includes(snapshot.id);
              return (
                <DropdownMenuCheckboxItem key={c.id} checked={checked} onCheckedChange={(next) => void favorites.setInCollection(c.id, snapshot, Boolean(next))}>
                  <span className="truncate">{c.name}</span>
                  <span className="ml-auto pl-2 text-xs text-muted-foreground">{c.articleIds.length}</span>
                </DropdownMenuCheckboxItem>
              );
            })}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setCreating(true)}>
              <PlusIcon /> Nouvelle liste…
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <CollectionDialog
        open={creating}
        onOpenChange={setCreating}
        title="Nouvelle liste"
        description="L'article sera enregistré dans cette liste."
        submitLabel="Créer et ajouter"
        onSubmit={async (name, description) => Boolean(await favorites.createCollection(name, { description, snapshot }))}
      />
    </>
  );
}
