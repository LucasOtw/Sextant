import { sameIdSet, type Favorite, type FavoriteSnapshot } from "@/lib/favorites-shared";
import { sameCollections, type Collection } from "@/lib/collections-shared";

/**
 * État des favoris et des listes côté client, sans React (QUAL-12) : un seul objet et un reducer pur, testé à part.
 * Le fournisseur (favorites-provider.tsx) garde la synchronisation avec le serveur : requête en vol, compteur de
 * mutations contre les réponses périmées, relances, retour sur l'onglet. Chaque action qui ne change rien renvoie
 * l'état tel quel, et une partie inchangée garde son identité : les cœurs et /favoris ne se re-rendent pas (PERF-12).
 */
export interface FavoritesState {
  /** Identifiants des favoris, dans l'ordre d'ajout. */
  ids: Set<string>;
  /** Instantanés des favoris ajoutés pendant la session (le serveur ne renvoie que des identifiants). */
  added: Map<string, Favorite>;
  /** Listes, dans l'ordre de création. */
  collections: Collection[];
  /** Les listes ont été chargées depuis le serveur pour l'utilisateur courant. */
  collectionsLoaded: boolean;
}

export const EMPTY_FAVORITES: FavoritesState = { ids: new Set(), added: new Map(), collections: [], collectionsLoaded: false };

export type CollectionPatch = { name?: string; description?: string; articleIds?: string[] };

export type FavoritesAction =
  /** Déconnexion : tout est vidé. */
  | { type: "reset" }
  /** Réponse du serveur : identifiants, et listes si la requête les a demandées (null : leur lecture a échoué). */
  | { type: "loaded"; ids: string[]; collections?: Collection[] | null }
  /** Listes lues par le serveur (GET /api/collections, ou graine d'une page tout juste rendue) : elles font foi. */
  | { type: "listsLoaded"; collections: Collection[] }
  /** Listes connues du rendu serveur, affichées en attendant le chargement, si rien n'est encore connu. */
  | { type: "listsSeeded"; collections: Collection[] }
  /** Autre compte : ses listes sont à relire. */
  | { type: "listsStale" }
  /** Favori enregistré par le serveur (instantané vérifié, date d'ajout). */
  | { type: "favoriteSaved"; favorite: Favorite }
  /** Favori ajouté hors bascule (intention honorée après connexion) : identifiant et instantané. */
  | { type: "favoriteAdded"; favorite: Favorite }
  /** Bascule optimiste du cœur : `favorite` = nouvel état ; un retrait sort l'article des listes `memberships`. */
  | { type: "toggled"; snapshot: FavoriteSnapshot; favorite: boolean; memberships: string[]; at: string }
  /** Retour arrière d'une bascule refusée par le serveur : `previous` = instantané d'avant un retrait. */
  | { type: "toggleReverted"; snapshot: FavoriteSnapshot; wasFavorite: boolean; memberships: string[]; previous: Favorite }
  /** Article mis ou retiré d'une liste ; `markFavorite` : l'ajout l'enregistre aussi en favori. */
  | { type: "listMembership"; listId: string; snapshot: FavoriteSnapshot; inList: boolean; markFavorite: boolean; at: string }
  /** Retour arrière d'un changement de liste refusé ; `unmarkFavorite` : l'ajout l'avait enregistré en favori. */
  | { type: "listMembershipReverted"; listId: string; snapshot: FavoriteSnapshot; wasIn: boolean; unmarkFavorite: boolean }
  | { type: "collectionCreated"; collection: Collection }
  /** Champs modifiés d'une liste ; le retour arrière repasse les seuls champs d'avant, sans écraser le reste. */
  | { type: "collectionPatched"; id: string; patch: CollectionPatch }
  | { type: "collectionRemoved"; id: string }
  /** Retour arrière d'une suppression : la liste revient à sa place, sans toucher aux autres. */
  | { type: "collectionRestored"; collection: Collection; index: number }
  | { type: "shareToken"; id: string; token: string | null };

export function without(c: Collection, id: string): Collection {
  return c.articleIds.includes(id) ? { ...c, articleIds: c.articleIds.filter((x) => x !== id) } : c;
}

export function withId(c: Collection, id: string): Collection {
  return c.articleIds.includes(id) ? c : { ...c, articleIds: [...c.articleIds, id] };
}

/** Index article → listes qui le contiennent. */
export function membershipIndex(collections: readonly Collection[]): Map<string, Collection[]> {
  const m = new Map<string, Collection[]>();
  for (const c of collections) {
    for (const id of c.articleIds) {
      const lists = m.get(id);
      if (lists) lists.push(c);
      else m.set(id, [c]);
    }
  }
  return m;
}

/** Identifiants des listes qui contiennent l'article. */
export function listsContaining(collections: readonly Collection[], id: string): string[] {
  return collections.filter((c) => c.articleIds.includes(id)).map((c) => c.id);
}

function withIds(state: FavoritesState, id: string, present: boolean): Set<string> {
  if (state.ids.has(id) === present) return state.ids;
  const next = new Set(state.ids);
  if (present) next.add(id);
  else next.delete(id);
  return next;
}

function withAdded(state: FavoritesState, id: string, favorite: Favorite | null): Map<string, Favorite> {
  if (!favorite && !state.added.has(id)) return state.added;
  const next = new Map(state.added);
  if (favorite) next.set(id, favorite);
  else next.delete(id);
  return next;
}

/** Applique `update` aux listes `targets` ; même tableau si aucune ne change. */
function mapLists(collections: Collection[], targets: (c: Collection) => boolean, update: (c: Collection) => Collection): Collection[] {
  let changed = false;
  const next = collections.map((c) => {
    if (!targets(c)) return c;
    const u = update(c);
    if (u !== c) changed = true;
    return u;
  });
  return changed ? next : collections;
}

/** Nouvel état, ou le même objet quand rien ne change (pas de rendu). */
function merge(state: FavoritesState, patch: Partial<FavoritesState>): FavoritesState {
  const keys = Object.keys(patch) as (keyof FavoritesState)[];
  return keys.some((k) => patch[k] !== state[k]) ? { ...state, ...patch } : state;
}

export function favoritesReducer(state: FavoritesState, action: FavoritesAction): FavoritesState {
  switch (action.type) {
    case "reset":
      return state.ids.size === 0 && state.added.size === 0 && state.collections.length === 0 && !state.collectionsLoaded ? state : EMPTY_FAVORITES;
    case "loaded": {
      // Rien de changé (cas courant du retour sur l'onglet) : les identifiants gardent leur objet (PERF-12).
      const ids = sameIdSet(state.ids, action.ids) ? state.ids : new Set(action.ids);
      const next = merge(state, { ids });
      return Array.isArray(action.collections) ? favoritesReducer(next, { type: "listsLoaded", collections: action.collections }) : next;
    }
    case "listsLoaded": {
      const same = state.collectionsLoaded && sameCollections(state.collections, action.collections);
      return merge(state, { collections: same ? state.collections : action.collections, collectionsLoaded: true });
    }
    case "listsSeeded":
      return !state.collectionsLoaded && state.collections.length === 0 ? merge(state, { collections: action.collections }) : state;
    case "listsStale":
      return merge(state, { collectionsLoaded: false });
    case "favoriteSaved":
      return merge(state, { added: withAdded(state, action.favorite.id, action.favorite) });
    case "favoriteAdded":
      return merge(state, { ids: withIds(state, action.favorite.id, true), added: withAdded(state, action.favorite.id, action.favorite) });
    case "toggled": {
      const { snapshot, favorite, memberships } = action;
      return merge(state, {
        ids: withIds(state, snapshot.id, favorite),
        added: withAdded(state, snapshot.id, favorite ? { ...snapshot, addedAt: action.at } : null),
        // Un favori retiré quitte ses listes (le serveur fait de même).
        collections: favorite ? state.collections : mapLists(state.collections, (c) => memberships.includes(c.id), (c) => without(c, snapshot.id)),
      });
    }
    case "toggleReverted": {
      const { snapshot, wasFavorite, memberships } = action;
      return merge(state, {
        ids: withIds(state, snapshot.id, wasFavorite),
        added: withAdded(state, snapshot.id, wasFavorite ? action.previous : null),
        collections: wasFavorite ? mapLists(state.collections, (c) => memberships.includes(c.id), (c) => withId(c, snapshot.id)) : state.collections,
      });
    }
    case "listMembership": {
      const { listId, snapshot, inList, markFavorite } = action;
      return merge(state, {
        collections: mapLists(state.collections, (c) => c.id === listId, (c) => (inList ? withId(c, snapshot.id) : without(c, snapshot.id))),
        ...(markFavorite ? { ids: withIds(state, snapshot.id, true), added: withAdded(state, snapshot.id, { ...snapshot, addedAt: action.at }) } : {}),
      });
    }
    case "listMembershipReverted": {
      const { listId, snapshot, wasIn, unmarkFavorite } = action;
      return merge(state, {
        collections: mapLists(state.collections, (c) => c.id === listId, (c) => (wasIn ? withId(c, snapshot.id) : without(c, snapshot.id))),
        ...(unmarkFavorite ? { ids: withIds(state, snapshot.id, false), added: withAdded(state, snapshot.id, null) } : {}),
      });
    }
    case "collectionCreated":
      return state.collections.some((c) => c.id === action.collection.id) ? state : merge(state, { collections: [...state.collections, action.collection] });
    case "collectionPatched":
      return merge(state, { collections: mapLists(state.collections, (c) => c.id === action.id, (c) => ({ ...c, ...action.patch })) });
    case "collectionRemoved":
      return state.collections.some((c) => c.id === action.id) ? merge(state, { collections: state.collections.filter((c) => c.id !== action.id) }) : state;
    case "collectionRestored": {
      if (state.collections.some((c) => c.id === action.collection.id)) return state;
      const collections = [...state.collections];
      collections.splice(Math.min(action.index, collections.length), 0, action.collection);
      return merge(state, { collections });
    }
    case "shareToken":
      return merge(state, { collections: mapLists(state.collections, (c) => c.id === action.id && c.shareToken !== action.token, (c) => ({ ...c, shareToken: action.token })) });
  }
}
