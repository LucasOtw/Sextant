"use client";

import { Suspense, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { FolderCheckIcon, FolderIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SignInDialog } from "@/components/auth/sign-in-dialog";
import { useFavorites } from "@/components/favorites/favorites-provider";
import type { FavoriteSnapshot } from "@/lib/favorites-shared";
import { cn } from "cn";

// Menu des listes : rendu côté serveur et préchargé pour un connecté, jamais téléchargé par un anonyme (PERF-03).
const CollectionMenu = dynamic(() => import("@/components/collections/collection-menu"));

interface Props {
  snapshot: FavoriteSnapshot;
  /** `icon` : dossier seul (cartes, liste) ; `button` : dossier + libellé (fiche article). */
  variant?: "icon" | "button";
  className?: string;
}

/** « Ajouter à une liste » : cases à cocher par liste, plus la création d'une nouvelle liste. */
export function CollectionPicker({ snapshot, variant = "icon", className }: Props) {
  const favorites = useFavorites();
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

  // Session pas encore connue (page en cache) : le même bouton, inerte, le temps de savoir qui est là (PERF-01).
  // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- enveloppe du vrai bouton, qui reçoit le clavier.
  const inert = <span onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} className="contents">{trigger}</span>;
  if (favorites.pending) return inert;

  if (!enabled) {
    return (
      <>
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- le clic vient du vrai bouton (trigger), activable au clavier ; l'enveloppe ne fait que l'intercepter. */}
        <span onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSignIn(true); }} className="contents">{trigger}</span>
        {signIn && <SignInDialog open={signIn} onOpenChange={setSignIn} intro="Connectez-vous pour organiser vos articles en listes." />}
      </>
    );
  }

  // Pendant le chargement du menu (navigation côté client), le même bouton, inerte, tient la place
  // (le clic ne doit pas atteindre la carte qui l'entoure).
  return (
    <Suspense fallback={inert}>
      <CollectionMenu snapshot={snapshot} trigger={trigger} />
    </Suspense>
  );
}
