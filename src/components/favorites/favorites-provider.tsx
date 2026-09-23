"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Favorite, FavoriteSnapshot } from "@/lib/favorites-shared";
import type { Collection } from "@/lib/collections-shared";

/** Article à enregistrer dès que la connexion aboutit (clic sur un cœur sans compte). */
export const PENDING_FAVORITE_KEY = "sextant:pendingFavorite";
/** Au-delà, une intention oubliée n'est plus honorée (ordinateur partagé, onglet laissé ouvert). */
const PENDING_MAX_AGE_MS = 10 * 60 * 1000;
/** Rechargement au retour sur l'onglet, au plus une fois par minute. */
const FOCUS_REFRESH_MIN_MS = 60 * 1000;
const NO_LISTS: Collection[] = [];

export interface PendingFavorite {
  snapshot: FavoriteSnapshot;
  at: number;
}

export function writePendingFavorite(snapshot: FavoriteSnapshot) {
  try {
    sessionStorage.setItem(PENDING_FAVORITE_KEY, JSON.stringify({ snapshot, at: Date.now() } satisfies PendingFavorite));
  } catch {
    /* stockage indisponible */
  }
}

export function clearPendingFavorite() {
  try {
    sessionStorage.removeItem(PENDING_FAVORITE_KEY);
  } catch {
    /* rien */
  }
}

interface FavoritesContext {
  /** L'utilisateur est connecté (les favoris sont possibles). */
  enabled: boolean;
  /** Les identifiants ont été chargés avec succès au moins une fois. */
  ready: boolean;
  /** Le dernier chargement a échoué (on garde ce qu'on sait). */
  error: boolean;
  count: number;
  has: (id: string) => boolean;
  /** Instantanés des favoris ajoutés pendant la session (le serveur ne renvoie que des identifiants). */
  added: Favorite[];
  /** Ajoute ou retire. Renvoie `"signin"` si l'utilisateur doit d'abord se connecter. */
  toggle: (snapshot: FavoriteSnapshot) => Promise<"added" | "removed" | "signin" | "error">;
  /** Recharge depuis le serveur (les listes aussi, si un écran les a demandées). */
  refresh: () => Promise<Set<string> | null>;
  /** Listes de l'utilisateur (dans l'ordre de création). Chargées à la demande : voir `loadCollections`. */
  collections: Collection[];
  /** Les listes ont été chargées depuis le serveur pour l'utilisateur courant. */
  collectionsLoaded: boolean;
  /** Demande le chargement des listes ; `seed` = listes déjà connues du rendu serveur, affichées sans attendre. */
  loadCollections: (seed?: Collection[]) => Promise<void>;
  /** Listes qui contiennent l'article. */
  listsOf: (id: string) => Collection[];
  /** Crée une liste ; avec `snapshot`, y range aussitôt l'article. */
  createCollection: (name: string, options?: { description?: string; snapshot?: FavoriteSnapshot }) => Promise<Collection | null>;
  /** Renomme, décrit ou réordonne (articleIds = nouvel ordre complet), en optimiste. */
  updateCollection: (id: string, patch: { name?: string; description?: string; articleIds?: string[] }) => Promise<boolean>;
  deleteCollection: (id: string) => Promise<boolean>;
  /** Met ou retire l'article d'une liste (l'ajout l'enregistre aussi en favori). */
  setInCollection: (id: string, snapshot: FavoriteSnapshot, inList: boolean, options?: { silent?: boolean }) => Promise<boolean>;
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

async function jsonOrError(res: Response): Promise<Record<string, unknown>> {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 401) throw new Error("Connectez-vous pour gérer vos listes.");
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Échec.");
  return data;
}

function without(c: Collection, id: string): Collection {
  return { ...c, articleIds: c.articleIds.filter((x) => x !== id) };
}

function withId(c: Collection, id: string): Collection {
  return c.articleIds.includes(id) ? c : { ...c, articleIds: [...c.articleIds, id] };
}

/**
 * État des favoris côté client : identifiants chargés en une requête légère, mises à jour optimistes,
 * partagé par tous les cœurs, la liste /favoris, les sélecteurs de liste et le compteur du header.
 */
export function FavoritesProvider({ userId, children }: Props) {
  const router = useRouter();
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Map<string, Favorite>>(new Map());
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionsLoaded, setCollectionsLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  /** Miroirs synchrones de `ids` et `collections`, lisibles depuis les callbacks asynchrones sans attendre un rendu. */
  const idsRef = useRef<Set<string>>(new Set());
  const collectionsRef = useRef<Collection[]>([]);
  const collectionsLoadedRef = useRef(false);
  /** Un écran affichant des listes a été monté : les chargements embarquent les listes. */
  const collectionsWanted = useRef(false);
  const loadedFor = useRef<string | null>(null);
  /** Incrémenté à chaque mutation : un chargement parti avant une mutation ne doit pas l'écraser. */
  const mutationSeq = useRef(0);
  const lastRefreshAt = useRef(0);
  const inFlight = useRef<Promise<Set<string> | null> | null>(null);
  const restoreRef = useRef<((snapshot: FavoriteSnapshot, lists: string[]) => Promise<void>) | null>(null);

  const applyIds = useCallback((next: Set<string>) => {
    idsRef.current = next;
    setIds(next);
  }, []);

  const applyCollections = useCallback((update: (prev: Collection[]) => Collection[]) => {
    collectionsRef.current = update(collectionsRef.current);
    setCollections(collectionsRef.current);
  }, []);

  const markCollectionsLoaded = useCallback((loaded: boolean) => {
    collectionsLoadedRef.current = loaded;
    setCollectionsLoaded(loaded);
  }, []);

  const refresh = useCallback(async (): Promise<Set<string> | null> => {
    // Une seule requête à la fois : focus + visibilitychange, ou plusieurs écrans montés ensemble, partagent la réponse.
    if (inFlight.current) return inFlight.current;
    const seq = mutationSeq.current;
    const forUser = userId;
    const withCollections = collectionsWanted.current;
    lastRefreshAt.current = Date.now();
    const run = (async () => {
      try {
        const res = await fetch(withCollections ? "/api/favorites?collections=1" : "/api/favorites", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { ids: string[]; collections?: Collection[] | null };
        // Réponse périmée : une mutation a eu lieu, ou l'utilisateur a changé entre-temps.
        if (seq !== mutationSeq.current || forUser !== loadedFor.current) return idsRef.current;
        const next = new Set(data.ids);
        applyIds(next);
        if (Array.isArray(data.collections)) {
          const fresh = data.collections;
          applyCollections(() => fresh);
          markCollectionsLoaded(true);
        }
        setReady(true);
        setError(false);
        return next;
      } catch {
        lastRefreshAt.current = 0;
        if (forUser === loadedFor.current) setError(true);
        return null;
      } finally {
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
  }, [userId, applyIds, applyCollections, markCollectionsLoaded]);

  const loadCollections = useCallback<FavoritesContext["loadCollections"]>(
    async (seed) => {
      collectionsWanted.current = true;
      if (seed && !collectionsLoadedRef.current && collectionsRef.current.length === 0) applyCollections(() => seed);
      // Avant le premier chargement (effet parent, exécuté après ceux des enfants), c'est lui qui embarquera les listes.
      if (!userId || loadedFor.current !== userId) return;
      if (inFlight.current) await inFlight.current;
      if (!collectionsLoadedRef.current) await refresh();
    },
    [userId, refresh, applyCollections],
  );

  /** Enregistre l'article mis en attente avant la connexion, s'il est récent et pas déjà présent. */
  const consumePending = useCallback(
    async (known: Set<string> | null) => {
      let pending: PendingFavorite | null = null;
      try {
        const raw = sessionStorage.getItem(PENDING_FAVORITE_KEY);
        if (!raw) return;
        sessionStorage.removeItem(PENDING_FAVORITE_KEY);
        pending = JSON.parse(raw) as PendingFavorite;
      } catch {
        return;
      }
      if (!pending?.snapshot?.id || Date.now() - (pending.at ?? 0) > PENDING_MAX_AGE_MS) return;
      if ((known ?? idsRef.current).has(pending.snapshot.id)) return;
      try {
        const favorite = await postFavorite(pending.snapshot);
        mutationSeq.current++;
        applyIds(new Set(idsRef.current).add(favorite.id));
        setAdded((prev) => new Map(prev).set(favorite.id, favorite));
        toast.success("Article ajouté à vos favoris.", { action: { label: "Voir", onClick: () => router.push("/favoris") } });
      } catch (e) {
        toast.error(e instanceof Error && e.message !== "signin" ? e.message : "L'article n'a pas pu être enregistré.");
      }
    },
    [router, applyIds],
  );

  useEffect(() => {
    if (!userId) {
      loadedFor.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- déconnexion : on vide l'état local
      applyIds(new Set());
      setAdded(new Map());
      applyCollections(() => []);
      markCollectionsLoaded(false);
      setReady(false);
      setError(false);
      return;
    }
    if (loadedFor.current === userId) return;
    loadedFor.current = userId;
    void refresh().then((known) => consumePending(known));
  }, [userId, refresh, consumePending, applyIds, applyCollections, markCollectionsLoaded]);

  // Retour sur l'onglet : on se réaligne avec ce qui a pu être fait sur un autre appareil.
  useEffect(() => {
    if (!userId) return;
    const onFocus = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRefreshAt.current < FOCUS_REFRESH_MIN_MS) return;
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [userId, refresh]);

  const toggle = useCallback<FavoritesContext["toggle"]>(
    async (snapshot) => {
      if (!userId) return "signin";
      // Avant le premier chargement, on ne sait pas si l'article est déjà enregistré : on charge d'abord.
      let known = idsRef.current;
      if (!ready) {
        const loaded = await refresh();
        if (!loaded) {
          toast.error("Vos favoris sont indisponibles pour le moment.");
          return "error";
        }
        known = loaded;
      }
      const wasFavorite = known.has(snapshot.id);
      const previousSnapshot = added.get(snapshot.id) ?? { ...snapshot, addedAt: null };
      // Un favori retiré quitte ses listes (le serveur fait de même) ; on les retient pour « Annuler ».
      const memberships = wasFavorite ? collectionsRef.current.filter((c) => c.articleIds.includes(snapshot.id)).map((c) => c.id) : [];
      mutationSeq.current++;
      // Optimiste : l'interface réagit tout de suite, on revient en arrière si le serveur refuse.
      const optimistic = new Set(known);
      if (wasFavorite) optimistic.delete(snapshot.id);
      else optimistic.add(snapshot.id);
      applyIds(optimistic);
      if (wasFavorite) setAdded((prev) => { const n = new Map(prev); n.delete(snapshot.id); return n; });
      else setAdded((prev) => new Map(prev).set(snapshot.id, { ...snapshot, addedAt: new Date().toISOString() }));
      if (memberships.length) applyCollections((prev) => prev.map((c) => (memberships.includes(c.id) ? without(c, snapshot.id) : c)));
      try {
        if (wasFavorite) {
          const res = await fetch(`/api/favorites?id=${snapshot.id}`, { method: "DELETE" });
          if (res.status === 401) throw new Error("signin");
          if (!res.ok) throw new Error("La suppression a échoué.");
          const n = memberships.length;
          toast(n ? `Retiré de vos favoris et de ${n} liste${n > 1 ? "s" : ""}.` : "Retiré de vos favoris.", {
            action: { label: "Annuler", onClick: () => void restoreRef.current?.(snapshot, memberships) },
          });
          return "removed";
        }
        const favorite = await postFavorite(snapshot);
        setAdded((prev) => new Map(prev).set(favorite.id, favorite));
        toast.success("Ajouté à vos favoris.", { action: { label: "Voir", onClick: () => router.push("/favoris") } });
        return "added";
      } catch (e) {
        mutationSeq.current++;
        const reverted = new Set(idsRef.current);
        if (wasFavorite) reverted.add(snapshot.id);
        else reverted.delete(snapshot.id);
        applyIds(reverted);
        if (wasFavorite) setAdded((prev) => new Map(prev).set(snapshot.id, previousSnapshot));
        else setAdded((prev) => { const n = new Map(prev); n.delete(snapshot.id); return n; });
        if (memberships.length) applyCollections((prev) => prev.map((c) => (memberships.includes(c.id) ? withId(c, snapshot.id) : c)));
        if (e instanceof Error && e.message === "signin") return "signin";
        toast.error(e instanceof Error ? e.message : "Impossible de mettre à jour vos favoris.");
        return "error";
      }
    },
    [userId, ready, refresh, router, added, applyIds, applyCollections],
  );

  const setInCollection = useCallback<FavoritesContext["setInCollection"]>(
    async (id, snapshot, inList, options) => {
      const target = collectionsRef.current.find((c) => c.id === id);
      if (!target) return false;
      const wasIn = target.articleIds.includes(snapshot.id);
      if (wasIn === inList) return true;
      mutationSeq.current++;
      applyCollections((prev) => prev.map((c) => (c.id === id ? (inList ? withId(c, snapshot.id) : without(c, snapshot.id)) : c)));
      const wasFavorite = idsRef.current.has(snapshot.id);
      if (inList && !wasFavorite) {
        applyIds(new Set(idsRef.current).add(snapshot.id));
        setAdded((prev) => new Map(prev).set(snapshot.id, { ...snapshot, addedAt: new Date().toISOString() }));
      }
      try {
        if (inList) {
          const data = await jsonOrError(await fetch(`/api/collections/${id}/articles`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(snapshot) }));
          const favorite = data.favorite as Favorite | undefined;
          if (favorite) setAdded((prev) => new Map(prev).set(favorite.id, favorite));
          if (!options?.silent) toast.success(`Ajouté à « ${target.name} ».`, { action: { label: "Voir", onClick: () => router.push(`/favoris?liste=${id}`) } });
        } else {
          await jsonOrError(await fetch(`/api/collections/${id}/articles?workId=${snapshot.id}`, { method: "DELETE" }));
          if (!options?.silent) toast(`Retiré de « ${target.name} ».`);
        }
        return true;
      } catch (e) {
        mutationSeq.current++;
        applyCollections((prev) => prev.map((c) => (c.id === id ? (wasIn ? withId(c, snapshot.id) : without(c, snapshot.id)) : c)));
        if (inList && !wasFavorite) {
          const reverted = new Set(idsRef.current);
          reverted.delete(snapshot.id);
          applyIds(reverted);
          setAdded((prev) => { const n = new Map(prev); n.delete(snapshot.id); return n; });
        }
        toast.error(e instanceof Error ? e.message : "La liste n'a pas pu être mise à jour.");
        return false;
      }
    },
    [router, applyIds, applyCollections],
  );

  // « Annuler » après un retrait : le favori revient, puis ses listes.
  useEffect(() => {
    restoreRef.current = async (snapshot, lists) => {
      if ((await toggle(snapshot)) !== "added") return;
      for (const id of lists) await setInCollection(id, snapshot, true, { silent: true });
    };
  }, [toggle, setInCollection]);

  const createCollection = useCallback<FavoritesContext["createCollection"]>(
    async (name, options) => {
      try {
        mutationSeq.current++;
        const data = await jsonOrError(await fetch("/api/collections", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, description: options?.description ?? "" }) }));
        const collection = data.collection as Collection;
        applyCollections((prev) => (prev.some((c) => c.id === collection.id) ? prev : [...prev, collection]));
        // La liste vient d'être posée dans le miroir synchrone : l'ajout la trouve sans attendre un rendu.
        if (options?.snapshot) await setInCollection(collection.id, options.snapshot, true);
        return collection;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "La liste n'a pas pu être créée.");
        return null;
      }
    },
    [applyCollections, setInCollection],
  );

  const updateCollection = useCallback<FavoritesContext["updateCollection"]>(
    async (id, patch) => {
      const previous = collectionsRef.current.find((c) => c.id === id);
      if (!previous) return false;
      mutationSeq.current++;
      applyCollections((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
      try {
        await jsonOrError(await fetch(`/api/collections/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }));
        return true;
      } catch (e) {
        applyCollections((prev) => prev.map((c) => (c.id === id ? previous : c)));
        toast.error(e instanceof Error ? e.message : "La modification a échoué.");
        return false;
      }
    },
    [applyCollections],
  );

  const deleteCollection = useCallback<FavoritesContext["deleteCollection"]>(
    async (id) => {
      const previous = collectionsRef.current;
      mutationSeq.current++;
      applyCollections((prev) => prev.filter((c) => c.id !== id));
      try {
        await jsonOrError(await fetch(`/api/collections/${id}`, { method: "DELETE" }));
        toast("Liste supprimée.", { description: "Ses articles restent dans vos favoris." });
        return true;
      } catch (e) {
        applyCollections(() => previous);
        toast.error(e instanceof Error ? e.message : "La suppression a échoué.");
        return false;
      }
    },
    [applyCollections],
  );

  /** Index article → listes, recalculé seulement quand les listes changent. */
  const membership = useMemo(() => {
    const m = new Map<string, Collection[]>();
    for (const c of collections) for (const id of c.articleIds) {
      const lists = m.get(id);
      if (lists) lists.push(c);
      else m.set(id, [c]);
    }
    return m;
  }, [collections]);

  const value = useMemo<FavoritesContext>(
    () => ({
      enabled: Boolean(userId),
      ready,
      error,
      count: ids.size,
      has: (id) => ids.has(id),
      added: [...added.values()].filter((f) => ids.has(f.id)),
      toggle,
      refresh,
      collections,
      collectionsLoaded,
      loadCollections,
      listsOf: (id) => membership.get(id) ?? NO_LISTS,
      createCollection,
      updateCollection,
      deleteCollection,
      setInCollection,
    }),
    [userId, ready, error, ids, added, toggle, refresh, collections, collectionsLoaded, loadCollections, membership, createCollection, updateCollection, deleteCollection, setInCollection],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFavorites(): FavoritesContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFavorites doit être utilisé sous FavoritesProvider.");
  return ctx;
}
