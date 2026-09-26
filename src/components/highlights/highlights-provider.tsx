"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { SignInDialog } from "@/components/auth/sign-in-dialog";
import type { FavoriteSnapshot } from "@/lib/favorites-shared";
import { MAX_HIGHLIGHT_TEXT, type Highlight, type HighlightInput } from "@/lib/highlights-shared";
import { undoToast } from "@/lib/undo-toast";
import { passagesSavedToast } from "@/lib/sentences";
import { api, errorMessage, needsSignIn } from "@/lib/client/api";

type NewHighlight = Omit<HighlightInput, "article">;

interface HighlightsContext {
  /** Utilisateur connecté : on peut enregistrer. Sinon, toute action ouvre la connexion. */
  enabled: boolean;
  snapshot: FavoriteSnapshot;
  /** Article rétracté (OpenAlex) : les références copiées le signalent. */
  retracted: boolean;
  highlights: Highlight[];
  add: (input: NewHighlight, options?: { silent?: boolean }) => Promise<Highlight | null>;
  /**
   * Enregistre plusieurs passages (choix de phrases), l'un après l'autre, avec un seul toast de réussite pour le lot
   * (« 2 passages surlignés. ») au lieu d'un par passage. true si tous ont été enregistrés.
   */
  addMany: (inputs: NewHighlight[]) => Promise<boolean>;
  updateNote: (id: string, note: string) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  requestSignIn: () => void;
}

const Ctx = createContext<HighlightsContext | null>(null);

interface Props {
  enabled: boolean;
  snapshot: FavoriteSnapshot;
  retracted?: boolean;
  initial: Highlight[];
  children: React.ReactNode;
}

/** Surlignages d'un article, partagés entre le résumé, le lecteur PDF et la section « Mes surlignages ». */
export function HighlightsProvider({ enabled, snapshot, retracted = false, initial, children }: Props) {
  const [highlights, setHighlights] = useState<Highlight[]>(initial);
  const [signIn, setSignIn] = useState(false);
  /** Miroir de la liste, lisible depuis les callbacks sans les recréer à chaque rendu. */
  const listRef = useRef(highlights);
  useEffect(() => {
    listRef.current = highlights;
  }, [highlights]);

  const requestSignIn = useCallback(() => setSignIn(true), []);

  /** Mutations lancées depuis l'affichage : la relecture serveur ne doit pas écraser un changement local. */
  const mutations = useRef(0);

  // Relecture à l'affichage : au retour arrière, Next réutilise la page déjà rendue, donc une liste périmée
  // (note modifiée ou passage supprimé depuis « Mes citations »). La modifier écraserait la version récente.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void fetch(`/api/highlights?work=${encodeURIComponent(snapshot.id)}`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ highlights?: Highlight[] }>) : null))
      .then((data) => {
        if (cancelled || !data?.highlights || mutations.current > 0) return;
        setHighlights(data.highlights);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled, snapshot.id]);

  const add = useCallback<HighlightsContext["add"]>(
    async (input, options) => {
      if (!enabled) {
        setSignIn(true);
        return null;
      }
      if (Array.from(input.text).length > MAX_HIGHLIGHT_TEXT) {
        toast.error(`Passage trop long : ${MAX_HIGHLIGHT_TEXT} caractères au plus. Sélectionnez un extrait plus court.`);
        return null;
      }
      mutations.current++;
      try {
        const { highlight: created } = await api<{ highlight: Highlight }>("/api/highlights", { method: "POST", json: { ...input, article: snapshot } });
        setHighlights((prev) => [created, ...prev]);
        if (!options?.silent) {
          toast.success(input.source === "manual" ? "Citation enregistrée." : "Passage surligné.", {
            description: "Retrouvez-le dans « Mes citations », avec sa source.",
          });
        }
        return created;
      } catch (e) {
        if (needsSignIn(e)) setSignIn(true);
        else toast.error(errorMessage(e, "Le passage n'a pas pu être enregistré."));
        return null;
      }
    },
    [enabled, snapshot],
  );

  const addMany = useCallback<HighlightsContext["addMany"]>(
    async (inputs) => {
      let saved = 0;
      for (const input of inputs) if (await add(input, { silent: true })) saved++;
      if (saved > 0) toast.success(...passagesSavedToast(saved));
      return saved === inputs.length;
    },
    [add],
  );

  const updateNote = useCallback<HighlightsContext["updateNote"]>(async (id, note) => {
    const previous = listRef.current.find((h) => h.id === id)?.note;
    if (previous === undefined || previous === note) return true;
    mutations.current++;
    setHighlights((prev) => prev.map((h) => (h.id === id ? { ...h, note } : h)));
    try {
      await api(`/api/highlights/${id}`, { method: "PATCH", json: { note } });
      return true;
    } catch (e) {
      setHighlights((prev) => prev.map((h) => (h.id === id ? { ...h, note: previous } : h)));
      toast.error(needsSignIn(e) ? "La note n'a pas pu être enregistrée." : errorMessage(e, "La note n'a pas pu être enregistrée."));
      return false;
    }
  }, []);

  const remove = useCallback<HighlightsContext["remove"]>(
    async (id) => {
      const previous = listRef.current;
      const removed = previous.find((h) => h.id === id);
      mutations.current++;
      setHighlights((prev) => prev.filter((h) => h.id !== id));
      try {
        await api(`/api/highlights/${id}`, { method: "DELETE" });
        // « Annuler » recrée le passage (nouvel identifiant, même contenu).
        if (removed) undoToast("Citation supprimée.", () => void add({ text: removed.text, page: removed.page, note: removed.note, source: removed.source, prefix: removed.prefix, suffix: removed.suffix }));
        else toast("Citation supprimée.");
        return true;
      } catch (e) {
        setHighlights(previous);
        toast.error(needsSignIn(e) ? "La suppression a échoué." : errorMessage(e, "La suppression a échoué."));
        return false;
      }
    },
    [add],
  );

  const value = useMemo<HighlightsContext>(
    () => ({ enabled, snapshot, retracted, highlights, add, addMany, updateNote, remove, requestSignIn }),
    [enabled, snapshot, retracted, highlights, add, addMany, updateNote, remove, requestSignIn],
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
