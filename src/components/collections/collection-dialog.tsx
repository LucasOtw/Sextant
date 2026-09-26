"use client";

import { useState } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MAX_COLLECTION_DESCRIPTION, MAX_COLLECTION_NAME } from "@/lib/collections-shared";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nom initial (renommage) ; vide pour une création. */
  initialName?: string;
  /** Description initiale de la liste (renommage). */
  initialDescription?: string;
  title: string;
  description?: string;
  submitLabel: string;
  onSubmit: (name: string, listDescription: string) => Promise<boolean>;
}

/** Formulaire d'une liste : un nom, c'est tout. */
export function CollectionDialog({ open, onOpenChange, initialName = "", initialDescription = "", title, description, submitLabel, onSubmit }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogTitle className="title-display text-2xl">{title}</DialogTitle>
        {description && <DialogDescription className="text-[15px] text-muted-foreground">{description}</DialogDescription>}
        {/* Le contenu est démonté à la fermeture : le formulaire repart du nom initial à chaque ouverture. */}
        <NameForm initialName={initialName} initialDescription={initialDescription} submitLabel={submitLabel} onSubmit={onSubmit} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function NameForm({ initialName, initialDescription, submitLabel, onSubmit, onClose }: { initialName: string; initialDescription: string; submitLabel: string; onSubmit: (name: string, listDescription: string) => Promise<boolean>; onClose: () => void }) {
  const [name, setName] = useState(initialName);
  const [listDescription, setListDescription] = useState(initialDescription);
  const [busy, setBusy] = useState(false);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = name.replace(/\s+/g, " ").trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const ok = await onSubmit(trimmed, listDescription.replace(/\s+/g, " ").trim());
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <form onSubmit={submit} className="mt-2 flex flex-col gap-3">
      <Input
        // eslint-disable-next-line jsx-a11y/no-autofocus -- champ d'un formulaire que l'utilisateur vient d'ouvrir : le focus y est attendu.
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={MAX_COLLECTION_NAME}
        placeholder="Ex. Mémoire 2026, Santé, À lire…"
        aria-label="Nom de la liste"
        className="h-10 text-base md:text-base"
      />
      <Textarea
        value={listDescription}
        onChange={(e) => setListDescription(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
        }}
        maxLength={MAX_COLLECTION_DESCRIPTION}
        rows={2}
        placeholder="Description (facultatif) : à quoi sert cette liste ?"
        aria-label="Description de la liste"
        className="text-base md:text-sm"
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Annuler</Button>
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy && <Loader2Icon className="animate-spin" />} {submitLabel}
        </Button>
      </div>
    </form>
  );
}
