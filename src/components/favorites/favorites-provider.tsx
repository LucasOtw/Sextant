"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Favorite, FavoriteSnapshot } from "@/lib/favorites-shared";

interface FavoritesContext {
  /** L'utilisateur est connecté (les favoris sont possibles). */
  enabled: boolean;
  /** La liste a été chargée au moins une fois. */
  ready: boolean;
  count: number;
  has: (id: string) => boolean;
  /** Ajoute ou retire. Renvoie `"signin"` si l'utilisateur doit d'abord se connecter. */
  toggle: (snapshot: FavoriteSnapshot) => Promise<"added" | "removed" | "signin" | "error">;
  remove: (id: string) => Promise<boolean>;
  /** Recharge depuis le serveur (après connexion, par exemple). */
  refresh: () => Promise<void>;
}

const Ctx = createContext<FavoritesContext | null>(null);

interface Props {
  userId: string | null;
  children: React.ReactNode;
}

/**
 * État des favoris côté client : un chargement par session connectée, mises à jour optimistes,
 * partagé par tous les cœurs de la page et par le compteur du header.
 */
export function FavoritesProvider({ userId, children }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<Map<string, Favorite>>(new Map());
  const [ready, setReady] = useState(false);
  const loadedFor = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/favorites", { cache: "no-store" });
      if (!res.ok) {
        setItems(new Map());
        setReady(true);
        return;
      }
      const data = (await res.json()) as { favorites: Favorite[] };
      setItems(new Map(data.favorites.map((f) => [f.id, f])));
      setReady(true);
    } catch {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      loadedFor.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- déconnexion : on vide l'état local
      setItems(new Map());
      return;
    }
    if (loadedFor.current === userId) return;
    loadedFor.current = userId;
    void refresh();
  }, [userId, refresh]);

  const toggle = useCallback<FavoritesContext["toggle"]>(
    async (snapshot) => {
      if (!userId) return "signin";
      const wasFavorite = items.has(snapshot.id);
      // Optimiste : l'interface réagit tout de suite, on revient en arrière si le serveur refuse.
      setItems((prev) => {
        const next = new Map(prev);
        if (wasFavorite) next.delete(snapshot.id);
        else next.set(snapshot.id, { ...snapshot, addedAt: null });
        return next;
      });
      try {
        const res = wasFavorite
          ? await fetch(`/api/favorites?id=${snapshot.id}`, { method: "DELETE" })
          : await fetch("/api/favorites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(snapshot) });
        if (res.status === 401) throw new Error("signin");
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? "Échec.");
        }
        if (wasFavorite) {
          toast("Retiré de vos favoris.");
          return "removed";
        }
        const { favorite } = (await res.json()) as { favorite: Favorite };
        setItems((prev) => new Map(prev).set(favorite.id, favorite));
        toast.success("Ajouté à vos favoris.", { action: { label: "Voir", onClick: () => router.push("/favoris") } });
        return "added";
      } catch (e) {
        setItems((prev) => {
          const next = new Map(prev);
          if (wasFavorite) next.set(snapshot.id, { ...snapshot, addedAt: null });
          else next.delete(snapshot.id);
          return next;
        });
        if (e instanceof Error && e.message === "signin") return "signin";
        toast.error(e instanceof Error ? e.message : "Impossible de mettre à jour vos favoris.");
        return "error";
      }
    },
    [items, userId, router],
  );

  const remove = useCallback<FavoritesContext["remove"]>(
    async (id) => {
      const prev = items.get(id);
      if (!prev) return true;
      return (await toggle(prev)) === "removed";
    },
    [items, toggle],
  );

  const value = useMemo<FavoritesContext>(
    () => ({ enabled: Boolean(userId), ready, count: items.size, has: (id) => items.has(id), toggle, remove, refresh }),
    [userId, ready, items, toggle, remove, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFavorites(): FavoritesContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFavorites doit être utilisé sous FavoritesProvider.");
  return ctx;
}
