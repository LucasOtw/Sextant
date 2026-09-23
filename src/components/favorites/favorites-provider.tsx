"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Favorite, FavoriteSnapshot } from "@/lib/favorites-shared";

/** Article à enregistrer dès que la connexion aboutit (clic sur un cœur sans compte). */
export const PENDING_FAVORITE_KEY = "sextant:pendingFavorite";

interface FavoritesContext {
  /** L'utilisateur est connecté (les favoris sont possibles). */
  enabled: boolean;
  /** La liste a été chargée avec succès au moins une fois. */
  ready: boolean;
  /** Le dernier chargement a échoué (on garde ce qu'on sait). */
  error: boolean;
  count: number;
  items: Favorite[];
  has: (id: string) => boolean;
  /** Ajoute ou retire. Renvoie `"signin"` si l'utilisateur doit d'abord se connecter. */
  toggle: (snapshot: FavoriteSnapshot) => Promise<"added" | "removed" | "signin" | "error">;
  /** Recharge depuis le serveur. */
  refresh: () => Promise<boolean>;
}

const Ctx = createContext<FavoritesContext | null>(null);

interface Props {
  userId: string | null;
  children: React.ReactNode;
}

async function postFavorite(snapshot: FavoriteSnapshot): Promise<Favorite> {
  const res = await fetch("/api/favorites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(snapshot) });
  if (res.status === 401) throw new Error("signin");
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "L'enregistrement a échoué.");
  }
  return ((await res.json()) as { favorite: Favorite }).favorite;
}

/**
 * État des favoris côté client : un chargement par session connectée, mises à jour optimistes,
 * partagé par tous les cœurs de la page, la liste /favoris et le compteur du header.
 */
export function FavoritesProvider({ userId, children }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<Map<string, Favorite>>(new Map());
  /** Dernier état connu, lisible depuis les callbacks asynchrones sans dépendre d'une fermeture périmée. */
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  /** Permet à l'action « Annuler » d'un toast de rappeler toggle sans référence circulaire. */
  const toggleRef = useRef<FavoritesContext["toggle"] | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const loadedFor = useRef<string | null>(null);
  /** Incrémenté à chaque mutation : un chargement parti avant une mutation ne doit pas l'écraser. */
  const mutationSeq = useRef(0);

  const refresh = useCallback(async (): Promise<boolean> => {
    const seq = mutationSeq.current;
    try {
      const res = await fetch("/api/favorites", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { favorites: Favorite[] };
      if (seq !== mutationSeq.current) return true; // une mutation a eu lieu entre-temps : l'état local est plus frais
      setItems(new Map(data.favorites.map((f) => [f.id, f])));
      setReady(true);
      setError(false);
      return true;
    } catch {
      setError(true);
      return false;
    }
  }, []);

  /** Enregistre l'article mis en attente avant la connexion, s'il y en a un. */
  const consumePending = useCallback(async () => {
    let snapshot: FavoriteSnapshot | null = null;
    try {
      const raw = sessionStorage.getItem(PENDING_FAVORITE_KEY);
      if (!raw) return;
      sessionStorage.removeItem(PENDING_FAVORITE_KEY);
      snapshot = JSON.parse(raw) as FavoriteSnapshot;
    } catch {
      return;
    }
    if (!snapshot || itemsRef.current.has(snapshot.id)) return;
    try {
      const favorite = await postFavorite(snapshot);
      mutationSeq.current++;
      setItems((prev) => new Map(prev).set(favorite.id, favorite));
      toast.success("Article ajouté à vos favoris.", { action: { label: "Voir", onClick: () => router.push("/favoris") } });
    } catch (e) {
      toast.error(e instanceof Error && e.message !== "signin" ? e.message : "L'article n'a pas pu être enregistré.");
    }
  }, [router]);

  useEffect(() => {
    if (!userId) {
      loadedFor.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- déconnexion : on vide l'état local
      setItems(new Map());
      setReady(false);
      return;
    }
    if (loadedFor.current === userId) return;
    loadedFor.current = userId;
    void refresh().then(() => consumePending());
  }, [userId, refresh, consumePending]);

  const toggle = useCallback<FavoritesContext["toggle"]>(
    async (snapshot) => {
      if (!userId) return "signin";
      // Avant le premier chargement, on ne sait pas si l'article est déjà enregistré : on charge d'abord.
      if (!ready) {
        const ok = await refresh();
        if (!ok) {
          toast.error("Vos favoris sont indisponibles pour le moment.");
          return "error";
        }
      }
      const wasFavorite = itemsRef.current.has(snapshot.id);
      const previous = itemsRef.current.get(snapshot.id);
      mutationSeq.current++;
      // Optimiste : l'interface réagit tout de suite, on revient en arrière si le serveur refuse.
      setItems((prev) => {
        const next = new Map(prev);
        if (wasFavorite) next.delete(snapshot.id);
        else next.set(snapshot.id, { ...snapshot, addedAt: new Date().toISOString() });
        return next;
      });
      try {
        if (wasFavorite) {
          const res = await fetch(`/api/favorites?id=${snapshot.id}`, { method: "DELETE" });
          if (res.status === 401) throw new Error("signin");
          if (!res.ok) throw new Error("La suppression a échoué.");
          toast("Retiré de vos favoris.", {
            action: { label: "Annuler", onClick: () => void toggleRef.current?.(previous ?? snapshot) },
          });
          return "removed";
        }
        const favorite = await postFavorite(snapshot);
        setItems((prev) => new Map(prev).set(favorite.id, favorite));
        toast.success("Ajouté à vos favoris.", { action: { label: "Voir", onClick: () => router.push("/favoris") } });
        return "added";
      } catch (e) {
        mutationSeq.current++;
        setItems((prev) => {
          const next = new Map(prev);
          if (wasFavorite && previous) next.set(snapshot.id, previous);
          else next.delete(snapshot.id);
          return next;
        });
        if (e instanceof Error && e.message === "signin") return "signin";
        toast.error(e instanceof Error ? e.message : "Impossible de mettre à jour vos favoris.");
        return "error";
      }
    },
    [userId, ready, refresh, router],
  );

  useEffect(() => {
    toggleRef.current = toggle;
  }, [toggle]);

  const value = useMemo<FavoritesContext>(() => {
    const list = [...items.values()].sort((a, b) => (b.addedAt ?? "").localeCompare(a.addedAt ?? ""));
    return { enabled: Boolean(userId), ready, error, count: items.size, items: list, has: (id) => items.has(id), toggle, refresh };
  }, [userId, ready, error, items, toggle, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFavorites(): FavoritesContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFavorites doit être utilisé sous FavoritesProvider.");
  return ctx;
}
