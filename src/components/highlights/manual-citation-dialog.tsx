"use client";

import { useState } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useHighlights } from "@/components/highlights/highlights-provider";
import { MAX_HIGHLIGHT_TEXT, MAX_NOTE } from "@/lib/highlights-shared";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Saisie d'une citation à la main : quand le PDF n'est pas libre, on garde quand même la trace du passage et de sa page. */
export function ManualCitationDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle className="title-display text-2xl">Ajouter une citation</DialogTitle>
        <DialogDescription className="text-[15px] text-muted-foreground">
          Recopiez le passage et indiquez la page : vous le retrouverez dans « Mes citations », avec sa référence.
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
      <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit(); }} maxLength={MAX_HIGHLIGHT_TEXT} rows={5} placeholder="Le passage, tel qu'il apparaît dans l'article…" aria-label="Passage" className="text-base md:text-base" />
      <div className="flex gap-3">
        <Input value={page} onChange={(e) => setPage(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="Page" aria-label="Page" className="h-10 w-28 text-base md:text-base" />
        <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={MAX_NOTE} placeholder="Note pour vous (facultatif)" aria-label="Note" className="h-10 flex-1 text-base md:text-base" />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Annuler</Button>
        <Button type="submit" disabled={busy || !text.trim()}>
          {busy && <Loader2Icon className="animate-spin" />} Enregistrer
        </Button>
      </div>
    </form>
  );
}
