"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, Loader2Icon, NotebookPenIcon } from "lucide-react";
import { toast } from "sonner";
import { SignInDialog } from "@/components/auth/sign-in-dialog";
import { Textarea } from "@/components/ui/textarea";
import type { FavoriteSnapshot } from "@/lib/favorites-shared";
import { MAX_ARTICLE_NOTE, type ArticleNote as Note } from "@/lib/notes-shared";

interface Props {
  enabled: boolean;
  snapshot: FavoriteSnapshot;
  initial: Note | null;
}

const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

/** « Ma note » : un texte libre sur l'article, enregistré tout seul quelques instants après la frappe. */
export function ArticleNote({ enabled, snapshot, initial }: Props) {
  const [text, setText] = useState(initial?.text ?? "");
  const [saved, setSaved] = useState(initial?.text ?? "");
  const [savedAt, setSavedAt] = useState<string | null>(initial?.updatedAt ?? null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [signIn, setSignIn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(text);
  useEffect(() => {
    latest.current = text;
  }, [text]);

  async function save(value: string) {
    if (value.trim() === saved.trim()) return;
    setStatus("saving");
    try {
      const res = await fetch(`/api/notes/${snapshot.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: value, article: snapshot }) });
      const data = (await res.json().catch(() => ({}))) as { note?: Note | null; error?: string };
      if (res.status === 401) {
        setSignIn(true);
        setStatus("idle");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Échec.");
      setSaved(data.note?.text ?? "");
      setSavedAt(data.note?.updatedAt ?? null);
      setStatus("saved");
    } catch (e) {
      setStatus("error");
      toast.error(e instanceof Error ? e.message : "La note n'a pas pu être enregistrée.");
    }
  }

  // Enregistrement différé : 900 ms après la dernière frappe, et au départ de la page.
  useEffect(() => {
    return () => clearTimeout(timer.current);
  }, []);

  function onChange(value: string) {
    setText(value);
    setStatus("idle");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(value), 900);
  }

  function onBlur() {
    clearTimeout(timer.current);
    void save(latest.current);
  }

  if (!enabled) {
    return (
      <section className="mt-8" aria-labelledby="ma-note-titre">
        <h2 id="ma-note-titre" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <NotebookPenIcon className="size-4" aria-hidden /> Ma note
        </h2>
        <p className="mt-2 text-[15px] text-muted-foreground">
          Ce que vous retenez de cet article, pour vous : une idée, une réserve, où il se place dans votre travail.{" "}
          <button type="button" onClick={() => setSignIn(true)} className="text-accent-brand underline underline-offset-3">Se connecter</button>
        </p>
        {signIn && <SignInDialog open={signIn} onOpenChange={setSignIn} intro="Connectez-vous pour garder vos notes sur les articles, sur tous vos appareils." />}
      </section>
    );
  }

  return (
    <section className="mt-8" aria-labelledby="ma-note-titre">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ma-note-titre" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <NotebookPenIcon className="size-4" aria-hidden /> Ma note
        </h2>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {status === "saving" && <span className="flex items-center gap-1"><Loader2Icon className="size-3 animate-spin" aria-hidden /> Enregistrement…</span>}
          {status === "saved" && <span className="flex items-center gap-1"><CheckIcon className="size-3" aria-hidden /> Enregistré</span>}
          {status === "error" && <span className="text-destructive">Non enregistré</span>}
          {status === "idle" && savedAt && <span>Modifié le {DATE.format(new Date(savedAt))}</span>}
        </p>
      </div>
      <Textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        maxLength={MAX_ARTICLE_NOTE}
        rows={text ? Math.min(12, Math.max(3, text.split("\n").length + 1)) : 3}
        placeholder="Ce que vous retenez de cet article, pour vous : une idée, une réserve, où il se place dans votre travail…"
        aria-label="Ma note sur cet article"
        className="mt-3 bg-card text-base leading-relaxed md:text-[15px]"
      />
      {signIn && <SignInDialog open={signIn} onOpenChange={setSignIn} intro="Connectez-vous pour garder vos notes sur les articles, sur tous vos appareils." />}
    </section>
  );
}
