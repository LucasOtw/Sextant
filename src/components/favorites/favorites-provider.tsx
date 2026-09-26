"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Favorite, FavoritePlacement, FavoriteSnapshot } from "@/lib/favorites-shared";
import type { Collection } from "@/lib/collections-shared";
import type { ClientUser } from "@/lib/session-shared";
import { undoToast } from "@/lib/undo-toast";
import { errorMessage, needsSignIn } from "@/lib/client/api";
import { useSession } from "@/components/auth/session-provider";
import * as remote from "@/components/favorites/favorites-api";
import { EMPTY_FAVORITES, favoritesReducer, listsContaining, membershipIndex, placementOf, type FavoritesAction, type FavoritesState } from "@/components/favorites/favorites-state";
import { readPendingFavorite } from "@/components/favorites/pending-favorite";

/** Rechargement au retour sur l'onglet, au plus une fois par minute. */
const FOCUS_REFRESH_MIN_MS = 60 * 1000;
/** Délais des relances d'un chargement revenu sans identité : croissants, puis plafonnés à la dernière valeur. */
const IDENTITY_RETRY_MS = [4_000, 15_000, 60_000];
const NO_LISTS: Collection[] = [];

interface FavoritesContext {
  /** L'utilisateur est connecté (les favoris sont possibles). */
  enabled: boolean;
  /**
   * La session n'est pas encore connue (rendu serveur, premier rendu client : les pages en cache sont les mêmes pour
   * tous). Les composants gardent alors l'état fourni par le serveur de la page (`initialActive`) ou restent neutres.
   */
  pending: boolean;
  /** Les identifiants ont été chargés avec succès au moins une fois. */
  ready: boolean;
  /** Le dernier chargement a échoué (on garde ce qu'on sait). */
  error: boolean;
  count: number;
  has: (id: string) => boolean;
  /** Identifiants des favoris, du plus récent au plus ancien. */
  favoriteIds: string[];
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
  /**
   * Demande le chargement des listes ; `seed` = listes déjà connues du rendu serveur, affichées sans attendre. Avec
   * `fresh`, `seed` vient d'être lu par le serveur pour cette session : il fait foi, sans relecture (PERF-10).
   */
  loadCollections: (seed?: Collection[], options?: { fresh?: boolean }) => Promise<void>;
  /** Listes qui contiennent l'article. */
  listsOf: (id: string) => Collection[];
  /** Crée une liste ; avec `snapshot`, y range aussitôt l'article. */
  createCollection: (name: string, options?: { description?: string; snapshot?: FavoriteSnapshot }) => Promise<Collection | null>;
  /** Renomme, décrit ou réordonne (articleIds = nouvel ordre complet), en optimiste. */
  updateCollection: (id: string, patch: { name?: string; description?: string; articleIds?: string[] }) => Promise<boolean>;
  deleteCollection: (id: string) => Promise<boolean>;
  /** Active (true) ou désactive (false) le lien de partage de la liste ; renvoie le jeton actif ou null. */
  setShared: (id: string, shared: boolean) => Promise<string | null | undefined>;
  /** Met ou retire l'article d'une liste (l'ajout l'enregistre aussi en favori). */
  setInCollection: (id: string, snapshot: FavoriteSnapshot, inList: boolean, options?: { silent?: boolean }) => Promise<boolean>;
}

const Ctx = createContext<FavoritesContext | null>(null);

interface Props {
  children: React.ReactNode;
}

interface FavoritesResponse {
  user?: ClientUser;
  ids?: string[];
  collections?: Collection[] | null;
}

/** Échec d'une opération sur les listes : une session expirée demande de se reconnecter, sinon le message de la route. */
function listError(e: unknown, fallback: string): string {
  return needsSignIn(e) ? "Connectez-vous pour gérer vos listes." : errorMessage(e, fallback);
}

/**
 * État des favoris côté client : identifiants chargés en une requête légère, mises à jour optimistes,
 * partagé par tous les cœurs, la liste /favoris, les sélecteurs de liste et le compteur du header.
 * Rattaché à la session du navigateur (SessionProvider) : sa clé change à chaque connexion ou déconnexion, et la
 * réponse de GET /api/favorites lui confirme l'identité (PERF-01).
 */
export function FavoritesProvider({ children }: Props) {
  const router = useRouter();
  const session = useSession();
  const { identify } = session;
  /** Clé de la session courante (nulle hors connexion) : les réponses d'une session remplacée sont ignorées. */
  const userId = session.key;
  const [state, setState] = useState<FavoritesState>(EMPTY_FAVORITES);
  const { ids, added, collections, collectionsLoaded } = state;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  /** Miroir synchrone de l'état, lisible depuis les callbacks asynchrones sans attendre un rendu. */
  const stateRef = useRef<FavoritesState>(EMPTY_FAVORITES);
  /** Un écran affichant des listes a été monté : les chargements embarquent les listes. */
  const collectionsWanted = useRef(false);
  const loadedFor = useRef<string | null>(null);
  /** Incrémenté à chaque mutation : un chargement parti avant une mutation ne doit pas l'écraser. */
  const mutationSeq = useRef(0);
  /** Valeur de `mutationSeq` à l'ouverture de la session courante : une graine du serveur n'est sûre que sans mutation depuis. */
  const sessionSeq = useRef(0);
  const lastRefreshAt = useRef(0);
  const inFlight = useRef<Promise<Set<string> | null> | null>(null);
  /** La requête en cours embarque les listes. */
  const inFlightLists = useRef(false);
  /** Le dernier chargement a reçu un 401 : la session a expiré ou a été révoquée. */
  const unauthorized = useRef(false);
  /**
   * Session dont un chargement est revenu sans identité (réseau, 503), à relancer (voir l'effet plus bas), avec le
   * nombre d'échecs : chaque nouvel échec pose un nouvel objet, donc un nouveau rendu et une nouvelle relance, plus tard.
   */
  const [identityRetry, setIdentityRetry] = useState<{ key: string; attempt: number } | null>(null);
  const restoreRef = useRef<((snapshot: FavoriteSnapshot, placement: FavoritePlacement) => Promise<void>) | null>(null);

  /** Applique l'action (favorites-state.ts) au miroir puis à l'état ; une action sans effet ne provoque aucun rendu. */
  const dispatch = useCallback((action: FavoritesAction) => {
    const next = favoritesReducer(stateRef.current, action);
    if (next === stateRef.current) return;
    stateRef.current = next;
    setState(next);
  }, []);

  const refresh = useCallback(async (options?: { lists?: boolean }): Promise<Set<string> | null> => {
    // Une seule requête à la fois : focus + visibilitychange, ou plusieurs écrans montés ensemble, partagent la réponse.
    if (inFlight.current) return inFlight.current;
    const seq = mutationSeq.current;
    const forUser = userId;
    const withCollections = options?.lists ?? collectionsWanted.current;
    lastRefreshAt.current = Date.now();
    const run = (async () => {
      /** La réponse a tranché l'identité (confirmée, ou session refusée). */
      let identified = false;
      try {
        const res = await fetch(withCollections ? "/api/favorites?collections=1" : "/api/favorites", { cache: "no-store" });
        unauthorized.current = res.status === 401;
        const data = (await res.json().catch(() => ({}))) as FavoritesResponse;
        // Identité confirmée (y compris quand Firestore échoue ou que la limite de débit est atteinte), ou session
        // refusée : l'en-tête suit. Un 503 (session invérifiable pour cause de panne) ne tranche rien : l'état
        // « connecté » est gardé et le chargement est relancé.
        if (res.status === 401) identify(null, forUser);
        else if (data.user) identify(data.user, forUser);
        identified = res.status === 401 || Boolean(data.user);
        if (!res.ok || !Array.isArray(data.ids)) throw new Error(String(res.status));
        // Réponse périmée : une mutation a eu lieu, ou l'utilisateur a changé entre-temps.
        if (seq !== mutationSeq.current || forUser !== loadedFor.current) return stateRef.current.ids;
        // Rien de changé (cas courant du retour sur l'onglet) : l'état reste le même objet, aucun cœur ne se re-rend (PERF-12).
        dispatch({ type: "loaded", ids: data.ids, collections: data.collections });
        setReady(true);
        setError(false);
        return stateRef.current.ids;
      } catch {
        lastRefreshAt.current = 0;
        if (forUser === loadedFor.current) {
          setError(true);
          // Réponse sans identité (réseau coupé, panne passagère) : sans relance, l'en-tête resterait sur la place de
          // l'avatar, sans menu ni déconnexion, jusqu'au retour sur l'onglet. Relances espacées (4 s, 15 s, puis 60 s).
          if (!identified && forUser) setIdentityRetry((prev) => ({ key: forUser, attempt: prev?.key === forUser ? prev.attempt + 1 : 1 }));
        }
        return null;
      } finally {
        inFlight.current = null;
        inFlightLists.current = false;
      }
    })();
    inFlight.current = run;
    inFlightLists.current = withCollections;
    return run;
  }, [userId, identify, dispatch]);

  /** Listes seules (GET /api/collections), en parallèle d'un chargement des favoris parti sans elles. */
  const fetchCollections = useCallback(async () => {
    const seq = mutationSeq.current;
    const forUser = userId;
    try {
      const res = await fetch("/api/collections", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { collections?: Collection[] };
      if (!Array.isArray(data.collections) || seq !== mutationSeq.current || forUser !== loadedFor.current) return;
      dispatch({ type: "listsLoaded", collections: data.collections });
    } catch {
      /* réseau : le prochain chargement (retour sur l'onglet) réessaiera */
    }
  }, [userId, dispatch]);

  const loadCollections = useCallback<FavoritesContext["loadCollections"]>(
    async (seed, options) => {
      collectionsWanted.current = true;
      if (seed && options?.fresh && !stateRef.current.collectionsLoaded && mutationSeq.current === sessionSeq.current) {
        // Lu à l'instant par le serveur de la page pour cette session : rien à relire (jusqu'à 50 lectures évitées).
        // Seulement si le fournisseur n'a encore rien de plus récent : au retour arrière, Next ressert la page d'origine
        // depuis le cache du routeur, avec ses anciennes listes, qui écraseraient un ajout fait depuis. L'état du
        // fournisseur, tenu à jour par chaque mutation, reste alors la référence.
        dispatch({ type: "listsLoaded", collections: seed });
        return;
      }
      if (seed) dispatch({ type: "listsSeeded", collections: seed });
      // Premier chargement pas encore lancé pour cette session : c'est lui qui embarquera les listes.
      if (!userId || loadedFor.current !== userId || stateRef.current.collectionsLoaded) return;
      // Chargement des favoris déjà parti sans les listes (le sélecteur de listes s'hydrate après le fournisseur quand
      // une frontière Suspense les sépare) : les listes partent en parallèle au lieu d'attendre puis de tout relancer.
      if (inFlight.current && !inFlightLists.current) return fetchCollections();
      if (inFlight.current) await inFlight.current;
      if (!stateRef.current.collectionsLoaded) await refresh();
    },
    [userId, refresh, fetchCollections, dispatch],
  );

  /** Enregistre l'article mis en attente avant la connexion, s'il est récent et pas déjà présent. */
  const consumePending = useCallback(
    async (known: Set<string> | null) => {
      const pending = readPendingFavorite();
      if (!pending || (known ?? stateRef.current.ids).has(pending.id)) return;
      try {
        const favorite = await remote.postFavorite(pending);
        mutationSeq.current++;
        dispatch({ type: "favoriteAdded", favorite });
        toast.success("Article ajouté à vos favoris.", { action: { label: "Voir", onClick: () => router.push("/favoris") } });
      } catch (e) {
        toast.error(needsSignIn(e) ? "L'article n'a pas pu être enregistré." : errorMessage(e, "L'article n'a pas pu être enregistré."));
      }
    },
    [router, dispatch],
  );

  useEffect(() => {
    if (!userId) {
      // Rien de chargé (session pas encore connue, ou anonyme) : on garde ce que les écrans ont déjà posé (listes lues
      // par le serveur de /favoris). Sinon, déconnexion : on vide l'état local.
      if (loadedFor.current === null) return;
      loadedFor.current = null;
      dispatch({ type: "reset" });
      setReady(false);
      setError(false);
      return;
    }
    if (loadedFor.current === userId) return;
    // Autre compte (ouvert dans un autre onglet) : ses listes sont à relire.
    if (loadedFor.current !== null) dispatch({ type: "listsStale" });
    loadedFor.current = userId;
    sessionSeq.current = mutationSeq.current;
    // Listes embarquées seulement si un écran les montre et que le serveur de la page ne les a pas déjà fournies.
    void refresh({ lists: collectionsWanted.current && !stateRef.current.collectionsLoaded }).then((known) => consumePending(known));
  }, [userId, refresh, consumePending, dispatch]);

  // Relance d'un chargement revenu sans identité, si elle n'est pas arrivée entre-temps : délai croissant et borné, tant
  // que l'identité manque. Onglet masqué : pas de requête, le retour sur l'onglet recharge (voir plus bas).
  const identityKnown = session.user !== null;
  useEffect(() => {
    if (!userId || !identityRetry || identityRetry.key !== userId || identityKnown) return;
    const delay = IDENTITY_RETRY_MS[Math.min(identityRetry.attempt, IDENTITY_RETRY_MS.length) - 1];
    const timer = setTimeout(() => {
      if (document.visibilityState !== "hidden") void refresh();
    }, delay);
    return () => clearTimeout(timer);
  }, [identityRetry, userId, identityKnown, refresh]);

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
      let known = stateRef.current.ids;
      if (!ready) {
        const loaded = await refresh();
        if (!loaded) {
          // Session expirée entre-temps : l'en-tête est repassé en anonyme, on propose de se reconnecter.
          if (unauthorized.current) return "signin";
          toast.error("Vos favoris sont indisponibles pour le moment.");
          return "error";
        }
        known = loaded;
      }
      const wasFavorite = known.has(snapshot.id);
      const previous = stateRef.current.added.get(snapshot.id) ?? { ...snapshot, addedAt: null };
      // Un favori retiré quitte ses listes (le serveur fait de même) ; on les retient pour « Annuler », avec sa place.
      const memberships = wasFavorite ? listsContaining(stateRef.current.collections, snapshot.id) : [];
      const localPlacement = wasFavorite ? placementOf(stateRef.current, snapshot.id) : null;
      mutationSeq.current++;
      // Optimiste : l'interface réagit tout de suite, on revient en arrière si le serveur refuse.
      dispatch({ type: "toggled", snapshot, favorite: !wasFavorite, memberships, at: new Date().toISOString() });
      try {
        if (wasFavorite) {
          // Place renvoyée par le serveur (date d'ajout comprise) ; à défaut, celle que le client connaissait.
          const placement = (await remote.deleteFavorite(snapshot.id)) ?? localPlacement;
          const n = memberships.length;
          undoToast(n ? `Retiré de vos favoris et de ${n} liste${n > 1 ? "s" : ""}.` : "Retiré de vos favoris.", () => {
            if (placement) void restoreRef.current?.(snapshot, placement);
          });
          return "removed";
        }
        dispatch({ type: "favoriteSaved", favorite: await remote.postFavorite(snapshot) });
        toast.success("Ajouté à vos favoris.", { action: { label: "Voir", onClick: () => router.push("/favoris") } });
        return "added";
      } catch (e) {
        mutationSeq.current++;
        dispatch({ type: "toggleReverted", snapshot, wasFavorite, memberships, previous });
        if (needsSignIn(e)) return "signin";
        toast.error(errorMessage(e, "Impossible de mettre à jour vos favoris."));
        return "error";
      }
    },
    [userId, ready, refresh, router, dispatch],
  );

  const setInCollection = useCallback<FavoritesContext["setInCollection"]>(
    async (id, snapshot, inList, options) => {
      const target = stateRef.current.collections.find((c) => c.id === id);
      if (!target) return false;
      const wasIn = target.articleIds.includes(snapshot.id);
      if (wasIn === inList) return true;
      mutationSeq.current++;
      // L'ajout à une liste enregistre aussi l'article en favori (le serveur fait de même).
      const markFavorite = inList && !stateRef.current.ids.has(snapshot.id);
      dispatch({ type: "listMembership", listId: id, snapshot, inList, markFavorite, at: new Date().toISOString() });
      try {
        if (inList) {
          const favorite = await remote.addToList(id, snapshot);
          if (favorite) dispatch({ type: "favoriteSaved", favorite });
          if (!options?.silent) toast.success(`Ajouté à « ${target.name} ».`, { action: { label: "Voir", onClick: () => router.push(`/favoris?liste=${id}`) } });
        } else {
          await remote.removeFromList(id, snapshot.id);
          if (!options?.silent) toast(`Retiré de « ${target.name} ».`);
        }
        return true;
      } catch (e) {
        mutationSeq.current++;
        dispatch({ type: "listMembershipReverted", listId: id, snapshot, wasIn, unmarkFavorite: markFavorite });
        toast.error(listError(e, "La liste n'a pas pu être mise à jour."));
        return false;
      }
    },
    [router, dispatch],
  );

  // « Annuler » après un retrait (NEW-8) : une seule requête rétablit le favori avec sa date d'ajout, et à son rang dans
  // chacune de ses listes (un nouvel ajout le mettrait en tête de « Mes favoris » et en dernier dans ses listes).
  useEffect(() => {
    restoreRef.current = async (snapshot, placement) => {
      // Ce que le rétablissement ajoute (un retour arrière n'enlève que cela) : l'article a pu être remis entre-temps.
      const { ids: known, collections: current } = stateRef.current;
      const had = known.has(snapshot.id);
      const inserted = placement.lists.filter((l) => current.some((c) => c.id === l.id && !c.articleIds.includes(snapshot.id))).map((l) => l.id);
      mutationSeq.current++;
      dispatch({ type: "favoriteRestored", snapshot, placement, at: new Date().toISOString() });
      try {
        const { favorite, collections: lists } = await remote.restoreFavorite(snapshot, placement);
        dispatch({ type: "favoriteSaved", favorite });
        // Ordre des listes tel que le serveur l'a écrit (une liste a pu changer entre-temps sur un autre appareil).
        for (const l of lists) dispatch({ type: "collectionPatched", id: l.id, patch: { articleIds: l.articleIds } });
        toast.success("Ajouté à vos favoris.", { action: { label: "Voir", onClick: () => router.push("/favoris") } });
      } catch (e) {
        mutationSeq.current++;
        if (had) for (const listId of inserted) dispatch({ type: "listMembershipReverted", listId, snapshot, wasIn: false, unmarkFavorite: false });
        else dispatch({ type: "toggled", snapshot, favorite: false, memberships: inserted, at: new Date().toISOString() });
        toast.error(needsSignIn(e) ? "Connectez-vous pour rétablir ce favori." : errorMessage(e, "Le favori n'a pas pu être rétabli."));
      }
    };
  }, [router, dispatch]);

  const createCollection = useCallback<FavoritesContext["createCollection"]>(
    async (name, options) => {
      try {
        mutationSeq.current++;
        const collection = await remote.postCollection(name, options?.description ?? "");
        dispatch({ type: "collectionCreated", collection });
        // La liste vient d'être posée dans le miroir synchrone : l'ajout la trouve sans attendre un rendu.
        if (options?.snapshot) await setInCollection(collection.id, options.snapshot, true);
        return collection;
      } catch (e) {
        toast.error(listError(e, "La liste n'a pas pu être créée."));
        return null;
      }
    },
    [dispatch, setInCollection],
  );

  const updateCollection = useCallback<FavoritesContext["updateCollection"]>(
    async (id, patch) => {
      const previous = stateRef.current.collections.find((c) => c.id === id);
      if (!previous) return false;
      // Retour arrière ciblé : seuls les champs modifiés reprennent leur valeur, un changement fait entre-temps reste.
      const before = Object.fromEntries(Object.keys(patch).map((k) => [k, previous[k as keyof typeof patch]]));
      mutationSeq.current++;
      dispatch({ type: "collectionPatched", id, patch });
      try {
        await remote.patchCollection(id, patch);
        return true;
      } catch (e) {
        dispatch({ type: "collectionPatched", id, patch: before });
        toast.error(listError(e, "La modification a échoué."));
        return false;
      }
    },
    [dispatch],
  );

  const deleteCollection = useCallback<FavoritesContext["deleteCollection"]>(
    async (id) => {
      const index = stateRef.current.collections.findIndex((c) => c.id === id);
      const previous = stateRef.current.collections[index];
      mutationSeq.current++;
      dispatch({ type: "collectionRemoved", id });
      try {
        await remote.deleteCollection(id);
        toast("Liste supprimée.", { description: "Ses articles restent dans vos favoris." });
        return true;
      } catch (e) {
        // La liste revient à sa place, sans défaire un ajout fait entre-temps dans une autre liste.
        if (previous) dispatch({ type: "collectionRestored", collection: previous, index });
        toast.error(listError(e, "La suppression a échoué."));
        return false;
      }
    },
    [dispatch],
  );

  const setShared = useCallback<FavoritesContext["setShared"]>(
    async (id, shared) => {
      try {
        mutationSeq.current++;
        if (shared) {
          const token = await remote.shareCollection(id);
          dispatch({ type: "shareToken", id, token });
          return token;
        }
        await remote.unshareCollection(id);
        dispatch({ type: "shareToken", id, token: null });
        toast("Lien désactivé.", { description: "Il ne fonctionne plus pour personne." });
        return null;
      } catch (e) {
        toast.error(listError(e, "Le partage n'a pas pu être modifié."));
        return undefined;
      }
    },
    [dispatch],
  );

  /** Index article → listes, recalculé seulement quand les listes changent. */
  const membership = useMemo(() => membershipIndex(collections), [collections]);

  // Fonctions et tableaux dérivés recréés seulement quand leur source change : /favoris peut s'en servir comme
  // dépendances de mémoïsation sans tout recalculer à chaque changement du contexte (PERF-12).
  const has = useCallback((id: string) => ids.has(id), [ids]);
  const favoriteIds = useMemo(() => [...ids].reverse(), [ids]);
  const addedList = useMemo(() => [...added.values()].filter((f) => ids.has(f.id)), [added, ids]);
  const listsOf = useCallback((id: string) => membership.get(id) ?? NO_LISTS, [membership]);

  const value = useMemo<FavoritesContext>(
    () => ({
      enabled: Boolean(userId),
      pending: session.status === "unknown",
      ready,
      error,
      count: ids.size,
      has,
      favoriteIds,
      added: addedList,
      toggle,
      refresh,
      collections,
      collectionsLoaded,
      loadCollections,
      listsOf,
      createCollection,
      updateCollection,
      deleteCollection,
      setShared,
      setInCollection,
    }),
    [userId, session.status, ready, error, ids, has, favoriteIds, addedList, toggle, refresh, collections, collectionsLoaded, loadCollections, listsOf, createCollection, updateCollection, deleteCollection, setShared, setInCollection],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFavorites(): FavoritesContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFavorites doit être utilisé sous FavoritesProvider.");
  return ctx;
}
