"use client";

import { useState, type ReactElement } from "react";
import { PlusIcon } from "lucide-react";
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
import { CollectionDialog } from "@/components/collections/collection-dialog";
import { useFavorites } from "@/components/favorites/favorites-provider";
import type { FavoriteSnapshot } from "@/lib/favorites-shared";

interface Props {
  snapshot: FavoriteSnapshot;
  /** Bouton déclencheur, construit par CollectionPicker (aussi affiché pendant le chargement de ce module). */
  trigger: ReactElement;
}

/**
 * Menu « Mes listes » d'un utilisateur connecté. Chargé à la demande par CollectionPicker : un visiteur anonyme
 * ne télécharge jamais Base UI Menu ni la fenêtre de création de liste.
 */
export default function CollectionMenu({ snapshot, trigger }: Props) {
  const favorites = useFavorites();
  const [creating, setCreating] = useState(false);

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
