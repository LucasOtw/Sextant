"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon, Link2Icon, Link2OffIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useFavorites } from "@/components/favorites/favorites-provider";
import { shareUrl, type Collection } from "@/lib/collections-shared";
import { useCopy } from "@/hooks/use-copy";
import { ExternalLink } from "@/components/external-link";
import { frSpaces } from "@/lib/text";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection: Collection;
}

/** Partager une liste en lecture seule : créer le lien, le copier, le désactiver. */
export function ShareDialog({ open, onOpenChange, collection }: Props) {
  const { setShared } = useFavorites();
  const [busy, setBusy] = useState(false);
  const { copied, copy: copyText } = useCopy();
  const url = collection.shareToken ? shareUrl(typeof window === "undefined" ? "" : window.location.origin, collection.shareToken) : null;

  const copy = (link: string) => copyText(link, { message: "Lien de partage copié.", failure: "Presse-papiers indisponible : sélectionnez le lien pour le copier." });

  async function enable() {
    setBusy(true);
    const token = await setShared(collection.id, true);
    setBusy(false);
    if (token) void copy(shareUrl(window.location.origin, token));
  }

  async function disable() {
    setBusy(true);
    await setShared(collection.id, false);
    setBusy(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="title-display flex items-center gap-2"><Link2Icon className="size-5 text-accent-brand" aria-hidden /> {frSpaces(`Partager « ${collection.name} »`)}</DialogTitle>
        <DialogDescription className="text-meta text-muted-foreground">
          Toute personne qui a le lien voit le nom de la liste, sa description et ses articles, sans compte. Vos notes, vos citations et votre
          profil ne sont jamais montrés. Vous pouvez désactiver le lien à tout moment.
        </DialogDescription>
        {url ? (
          <div className="mt-2 flex flex-col gap-3">
            <div className="flex gap-2">
              <Input readOnly value={url} aria-label="Lien de partage" onFocus={(e) => e.currentTarget.select()} className="text-base tabular-nums md:text-sm" />
              <Button className="shrink-0" onClick={() => void copy(url)}>{copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Copié" : "Copier"}</Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <ExternalLink href={url} className="link text-sm">Voir la page partagée</ExternalLink>
              <Button variant="destructive-ghost" size="sm" disabled={busy} onClick={() => void disable()}>
                {busy ? <Loader2Icon className="animate-spin" /> : <Link2OffIcon />} Désactiver le lien
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button disabled={busy} onClick={() => void enable()}>
              {busy ? <Loader2Icon className="animate-spin" /> : <Link2Icon />} Créer le lien
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
