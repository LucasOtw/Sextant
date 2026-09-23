"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { SignInDialog } from "@/components/auth/sign-in-dialog";
import type { FavoriteSnapshot } from "@/lib/favorites-shared";
import type { Highlight, HighlightInput } from "@/lib/highlights-shared";

export type NewHighlight = Omit<HighlightInput, "article">;

interface HighlightsContext {
  /** Utilisateur connecté : on peut enregistrer. Sinon, toute action ouvre la connexion. */
  enabled: boolean;
  snapshot: FavoriteSnapshot;
  highlights: Highlight[];
  add: (input: NewHighlight) => Promise<Highlight | null>;
  updateNote: (id: string, note: string) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  requestSignIn: () => void;
}

const Ctx = createContext<HighlightsContext | null>(null);

async function jsonOrError(res: Response): Promise<Record<string, unknown>> {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 401) throw new Error("signin");
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Échec.");
  return data;
}

interface Props {
  enabled: boolean;
  snapshot: FavoriteSnapshot;
  initial: Highlight[];
  children: React.ReactNode;
}

/** Surlignages d'un article, partagés entre le résumé, le lecteur PDF et la section « Mes surlignages ». */
export function HighlightsProvider({ enabled, snapshot, initial, children }: Props) {
  const [highlights, setHighlights] = useState<Highlight[]>(initial);
  const [signIn, setSignIn] = useState(false);
  /** Miroir de la liste, lisible depuis les callbacks sans les recréer à chaque rendu. */
  const listRef = useRef(highlights);
  useEffect(() => {
    listRef.current = highlights;
  }, [highlights]);

  const requestSignIn = useCallback(() => setSignIn(true), []);

  const add = useCallback<HighlightsContext["add"]>(
    async (input) => {
      if (!enabled) {
        setSignIn(true);
        return null;
      }
      try {
        const data = await jsonOrError(
          await fetch("/api/highlights", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...input, article: snapshot }) }),
        );
        const created = data.highlight as Highlight;
        setHighlights((prev) => [created, ...prev]);
        toast.success(input.source === "manual" ? "Citation enregistrée." : "Passage surligné.", {
          description: "Retrouvez-le dans « Mes citations », avec sa source.",
        });
        return created;
      } catch (e) {
        if (e instanceof Error && e.message === "signin") setSignIn(true);
        else toast.error(e instanceof Error ? e.message : "Le passage n'a pas pu être enregistré.");
        return null;
      }
    },
    [enabled, snapshot],
  );

  const updateNote = useCallback<HighlightsContext["updateNote"]>(async (id, note) => {
    const previous = listRef.current.find((h) => h.id === id)?.note;
    if (previous === undefined || previous === note) return true;
    setHighlights((prev) => prev.map((h) => (h.id === id ? { ...h, note } : h)));
    try {
      await jsonOrError(await fetch(`/api/highlights/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ note }) }));
      return true;
    } catch (e) {
      setHighlights((prev) => prev.map((h) => (h.id === id ? { ...h, note: previous } : h)));
      toast.error(e instanceof Error && e.message !== "signin" ? e.message : "La note n'a pas pu être enregistrée.");
      return false;
    }
  }, []);

  const remove = useCallback<HighlightsContext["remove"]>(async (id) => {
    const previous = listRef.current;
    setHighlights((prev) => prev.filter((h) => h.id !== id));
    try {
      await jsonOrError(await fetch(`/api/highlights/${id}`, { method: "DELETE" }));
      toast("Surlignage supprimé.");
      return true;
    } catch (e) {
      setHighlights(previous);
      toast.error(e instanceof Error && e.message !== "signin" ? e.message : "La suppression a échoué.");
      return false;
    }
  }, []);

  const value = useMemo<HighlightsContext>(
    () => ({ enabled, snapshot, highlights, add, updateNote, remove, requestSignIn }),
    [enabled, snapshot, highlights, add, updateNote, remove, requestSignIn],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {signIn && <SignInDialog open={signIn} onOpenChange={setSignIn} intro="Connectez-vous pour surligner un passage et le retrouver plus tard, avec sa source." />}
    </Ctx.Provider>
  );
}

export function useHighlights(): HighlightsContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useHighlights doit être utilisé sous HighlightsProvider.");
  return ctx;
}
