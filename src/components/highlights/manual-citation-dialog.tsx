"use client";

import { useState } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useDialogContainer } from "@/components/highlights/dialog-container";
import { useHighlights } from "@/components/highlights/highlights-provider";
import { MAX_HIGHLIGHT_TEXT, MAX_NOTE } from "@/lib/highlights-shared";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Saisie d'une citation à la main : quand le PDF n'est pas libre, on garde quand même la trace du passage et de sa page. */
export function ManualCitationDialog({ open, onOpenChange }: Props) {
  const container = useDialogContainer();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent container={container} className="sm:max-w-lg">
        <DialogTitle className="title-display">Ajouter une citation</DialogTitle>
        <DialogDescription className="text-meta text-muted-foreground">
          Recopiez le passage et indiquez la page : vous le retrouverez dans «&nbsp;Mes citations&nbsp;», avec sa référence.
        </DialogDescription>
        <Form onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function Form({ onClose }: { onClose: () => void }) {
  const { add } = useHighlights();
  const [text, setText] = useState("");
  const [page, setPage] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    const n = Number(page);
    const created = await add({ source: "manual", text: text.trim(), page: Number.isInteger(n) && n > 0 ? n : null, note: note.trim(), prefix: "", suffix: "" });
    setBusy(false);
    if (created) onClose();
  }

  return (
    <form onSubmit={submit} className="mt-2 flex flex-col gap-3">
      <Field label="Passage">
        {(control) => (
          <Textarea
            {...control}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- champ d'une fenêtre que l'utilisateur vient d'ouvrir : le focus y est attendu.
            autoFocus
            aria-required="true"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
            }}
            maxLength={MAX_HIGHLIGHT_TEXT}
            rows={5}
            placeholder="Le passage, tel qu'il apparaît dans l'article…"
            className="text-base md:text-base"
          />
        )}
      </Field>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Field label="Page" optional className="shrink-0 sm:w-36">
          {(control) => (
            <Input {...control} value={page} onChange={(e) => setPage(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="Ex. 12" className="h-10 w-28 text-base sm:w-full md:text-base" />
          )}
        </Field>
        <Field label="Note" optional className="min-w-0 flex-1">
          {(control) => (
            <Input {...control} value={note} onChange={(e) => setNote(e.target.value)} maxLength={MAX_NOTE} placeholder="Pour vous" className="text-base md:text-base" />
          )}
        </Field>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Annuler</Button>
        <Button type="submit" disabled={busy || !text.trim()}>
          {busy && <Loader2Icon className="animate-spin" />} Enregistrer
        </Button>
      </div>
    </form>
  );
}
