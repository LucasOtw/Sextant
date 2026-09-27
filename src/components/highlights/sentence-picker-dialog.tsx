"use client";

import { useState } from "react";
import { HighlighterIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useDialogContainer } from "@/components/highlights/dialog-container";
import { pendingIndexes, type Sentence } from "@/lib/sentences";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Phrases proposées ; null pendant le chargement (page du PDF). */
  sentences: Sentence[] | null;
  /** Échec du chargement des phrases. */
  error?: string | null;
  /** Langue du texte (attribut `lang` des phrases). */
  lang?: string;
  /** Phrase déjà comprise dans un passage retenu : cochée et inactive. */
  isHighlighted: (sentence: Sentence) => boolean;
  /**
   * Enregistre les phrases cochées (indices) ; `ok` si tout a été enregistré (la fenêtre se ferme), sinon `error`, la
   * raison du refus, dite dans la fenêtre.
   */
  onSave: (indexes: number[]) => Promise<{ ok: boolean; error?: string }>;
  /** Contrôles au-dessus de la liste (choix de la page dans le lecteur PDF). */
  children?: React.ReactNode;
}

/**
 * Surligner sans sélectionner à la souris (A11Y-18) : les phrases du texte en cases à cocher, parcourues au clavier
 * (Tab, Espace) et lues par les lecteurs d'écran. Des phrases qui se suivent forment un seul passage.
 */
export function SentencePickerDialog({ open, onOpenChange, title, description, ...rest }: Props) {
  const container = useDialogContainer();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent container={container} className="max-h-[92dvh] min-w-0 overflow-y-auto sm:max-w-xl">
        <DialogTitle className="title-display">{title}</DialogTitle>
        <DialogDescription className="text-meta text-muted-foreground">{description}</DialogDescription>
        {/* Monté à l'ouverture seulement : les cases repartent décochées à chaque fois. */}
        {open && <Picker {...rest} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Picker({ sentences, error, lang, isHighlighted, onSave, children, onClose }: Omit<Props, "open" | "onOpenChange" | "title" | "description"> & { onClose: () => void }) {
  const [checked, setChecked] = useState<Set<number>>(() => new Set());
  const [shown, setShown] = useState(sentences);
  const [busy, setBusy] = useState(false);
  /**
   * Échec d'enregistrement dit dans la fenêtre : le toast d'erreur est monté dans <body>, invisible et inerte quand le
   * lecteur PDF est en plein écran natif (seul son conteneur s'affiche), où la fenêtre restait ouverte sans explication.
   */
  const [saveError, setSaveError] = useState<string | null>(null);

  // Autre page du PDF : nouvelles phrases, on repart d'une liste vierge.
  if (shown !== sentences) {
    setShown(sentences);
    setChecked(new Set());
    setSaveError(null);
  }

  function toggle(i: number, on: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(i);
      else next.delete(i);
      return next;
    });
  }

  // Seules les phrases pas encore retenues partent : après un enregistrement partiel, les autres restent cochées.
  const pending = sentences ? pendingIndexes(checked, sentences, isHighlighted) : [];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pending.length === 0 || busy) return;
    setBusy(true);
    setSaveError(null);
    const result = await onSave(pending);
    setBusy(false);
    if (result.ok) return onClose();
    // La raison du refus quand elle est connue : « Réessayez » ne vaut que pour un échec passager (réseau, serveur).
    const failed = `${pending.length > 1 ? "Certaines phrases n'ont" : "La phrase n'a"} pas pu être surlignée${pending.length > 1 ? "s" : ""}.`;
    setSaveError(`${failed} ${result.error ?? "Réessayez."}`);
  }

  return (
    <form onSubmit={save} className="flex min-w-0 flex-col gap-3">
      {children}
      {error ? (
        <p role="alert" className="text-sm text-destructive">{error}</p>
      ) : sentences === null ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" aria-hidden /> Lecture du texte…
        </p>
      ) : sentences.length === 0 ? (
        <p role="status" className="text-sm text-muted-foreground">Aucune phrase à surligner ici.</p>
      ) : (
        <fieldset className="min-w-0">
          <legend className="text-sm font-medium text-muted-foreground">
            {sentences.length} phrase{sentences.length > 1 ? "s" : ""}
            <span className="block font-normal">Des phrases cochées qui se suivent forment un seul passage.</span>
          </legend>
          <ul className="mt-2 flex flex-col gap-1">
            {sentences.map((s, i) => {
              const done = isHighlighted(s);
              return (
                <li key={`${s.start}-${s.end}`}>
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 text-meta leading-relaxed hover:bg-accent has-disabled:cursor-default has-disabled:hover:bg-transparent">
                    <input
                      type="checkbox"
                      className="mt-1.5 size-4 shrink-0 accent-accent-brand"
                      checked={done || checked.has(i)}
                      disabled={done}
                      onChange={(e) => toggle(i, e.target.checked)}
                    />
                    <span className="min-w-0 wrap-break-word">
                      <span lang={lang}>{s.text}</span>
                      {done && <span className="text-sm text-muted-foreground"> (déjà surlignée)</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}
      {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Annuler</Button>
        <Button type="submit" disabled={busy || pending.length === 0}>
          {busy ? <Loader2Icon className="animate-spin" /> : <HighlighterIcon />} Surligner{pending.length > 0 && ` (${pending.length})`}
        </Button>
      </div>
    </form>
  );
}
