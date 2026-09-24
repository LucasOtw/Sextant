"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const [savedAt, setSavedAt] = useState<string | null>(initial?.updatedAt ?? null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [signIn, setSignIn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** Dernier texte saisi (lu par les gestionnaires de départ, sans attendre un rendu). */
  const pending = useRef(text);
  /** Dernier texte envoyé avec succès (tel que saisi, avant nettoyage serveur : sert de point de comparaison). */
  const sent = useRef(text);
  /** Un envoi en cours : jamais deux PUT en vol, pour qu'une version ancienne n'arrive pas après la récente. */
  const inflight = useRef(false);
  /** L'utilisateur a tapé depuis l'affichage : la relecture serveur ne doit pas écraser sa saisie. */
  const dirty = useRef(false);
  const url = `/api/notes/${snapshot.id}`;

  /** Envoie la dernière saisie, puis la suivante si l'utilisateur a continué de taper pendant l'envoi. */
  const save = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      while (pending.current.trim() !== sent.current.trim()) {
        const value = pending.current;
        setStatus("saving");
        try {
          const res = await fetch(url, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: value, article: snapshot }) });
          const data = (await res.json().catch(() => ({}))) as { note?: Note | null; error?: string };
          if (res.status === 401) {
            setSignIn(true);
            setStatus("idle");
            return;
          }
          if (!res.ok) throw new Error(data.error ?? "Échec.");
          sent.current = value;
          setSavedAt(data.note?.updatedAt ?? null);
          setStatus("saved");
        } catch (e) {
          setStatus("error");
          toast.error(e instanceof Error ? e.message : "La note n'a pas pu être enregistrée.");
          return;
        }
      }
    } finally {
      inflight.current = false;
    }
  }, [url, snapshot]);

  /**
   * Départ de la page (fermeture, rechargement, retour arrière, onglet masqué) : la saisie en attente part en
   * `keepalive`, qui survit au déchargement. En cas d'échec (session expirée, limite, réseau), `sent` reprend sa
   * valeur précédente pour que le prochain `save()` (retour sur l'onglet, frappe, blur) renvoie la note.
   * Les mises à jour d'état sur un composant démonté sont sans effet.
   */
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const value = pending.current;
    if (value.trim() === sent.current.trim()) return;
    const prev = sent.current;
    sent.current = value;
    const restore = () => {
      if (sent.current !== value) return;
      sent.current = prev;
      // L'utilisateur est déjà revenu sur l'onglet pendant l'envoi : renvoi immédiat par la voie normale.
      if (document.visibilityState === "visible") void save();
    };
    void fetch(url, { method: "PUT", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ text: value, article: snapshot }) })
      .then(async (res) => {
        if (!res.ok) return restore();
        const data = (await res.json().catch(() => ({}))) as { note?: Note | null };
        setSavedAt(data.note?.updatedAt ?? null);
        setStatus("saved");
      })
      .catch(restore);
  }, [url, snapshot, save]);

  // Enregistrement différé : 900 ms après la dernière frappe, au blur, et au départ de la page (flush).
  useEffect(() => {
    if (!enabled) return;
    // Onglet masqué : envoi `keepalive` ; retour sur l'onglet : renvoi par la voie normale si cet envoi a échoué.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
      else void save();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [enabled, flush, save]);

  // Relecture à l'affichage : au retour arrière, Next réutilise la page déjà rendue, donc une note périmée.
  // La compléter réécrirait l'ancienne version par-dessus la récente.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void fetch(url, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ note?: Note | null }>) : null))
      .then((data) => {
        if (cancelled || !data || dirty.current || inflight.current) return;
        const fresh = data.note?.text ?? "";
        pending.current = fresh;
        sent.current = fresh;
        setText(fresh);
        setSavedAt(data.note?.updatedAt ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled, url]);

  function onChange(value: string) {
    dirty.current = true;
    pending.current = value;
    setText(value);
    setStatus("idle");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 900);
  }

  function onBlur() {
    clearTimeout(timer.current);
    void save();
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
