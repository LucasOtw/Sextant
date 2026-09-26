"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { hasSessionHint, SESSION_HINT_COOKIE, type ClientUser } from "@/lib/session-shared";

/**
 * - `unknown` : rendu serveur et premier rendu client (les pages, mises en cache, sont les mêmes pour tous) ;
 * - `anonymous` : aucun indice de connexion ;
 * - `signed-in` : connecté d'après l'indice ; `user` arrive avec la première réponse de GET /api/favorites.
 */
export type SessionStatus = "unknown" | "anonymous" | "signed-in";

interface SessionContext {
  status: SessionStatus;
  /** Identité à afficher ; null tant qu'elle n'est pas arrivée, ou pour un anonyme. */
  user: ClientUser | null;
  /**
   * Clé de la session courante, nulle hors connexion : change à chaque connexion ou déconnexion. Les chargements liés
   * au compte (favoris, listes) s'y rattachent pour ignorer une réponse arrivée après un changement de compte.
   */
  key: string | null;
  /** Réponse du serveur pour la session `forKey` : identité confirmée, ou null (session expirée ou révoquée). */
  identify: (user: ClientUser | null, forKey: string | null) => void;
  /** Connexion réussie (fenêtre Google) : identité déjà connue par la réponse du serveur. */
  signedIn: (user: ClientUser) => void;
  /** Déconnexion, suppression du compte : l'interface repasse aussitôt en anonyme. */
  signedOut: () => void;
}

const Ctx = createContext<SessionContext | null>(null);

let keySeq = 0;
const newKey = () => `s${++keySeq}`;

type State = { status: SessionStatus; user: ClientUser | null; key: string | null };
const UNKNOWN: State = { status: "unknown", user: null, key: null };
const ANONYMOUS: State = { status: "anonymous", user: null, key: null };

function readHint(): boolean {
  try {
    return hasSessionHint(document.cookie);
  } catch {
    return false;
  }
}

function clearHint() {
  try {
    document.cookie = `${SESSION_HINT_COOKIE}=; Max-Age=0; path=/; SameSite=Lax`;
  } catch {
    /* cookies indisponibles */
  }
}

/**
 * Identité côté client (PERF-01). Le layout ne lit plus le cookie de session : l'accueil et les pages sans données
 * personnelles sont mises en cache au bord, identiques pour tous. Le navigateur sait par l'indice `sextant_signed_in`
 * (qui suit la session, sans valeur secrète) s'il y a une session, sans requête pour un anonyme ; l'identité
 * elle-même vient de GET /api/favorites (FavoritesProvider), jamais du HTML en cache. L'indice est relu à chaque
 * navigation et au retour sur l'onglet (session ouverte ou fermée dans un autre onglet, ou rattrapée par le proxy pour
 * une session ouverte avant l'indice).
 */
export function SessionProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const [state, setState] = useState<State>(UNKNOWN);
  const stateRef = useRef(state);
  const pathname = usePathname();

  const apply = useCallback((next: State) => {
    stateRef.current = next;
    setState(next);
  }, []);

  /** Aligne l'état sur l'indice : anonyme sans indice, connecté (identité à venir) avec. */
  const sync = useCallback(() => {
    if (!enabled) {
      if (stateRef.current.status !== "anonymous") apply(ANONYMOUS);
      return;
    }
    const hint = readHint();
    const current = stateRef.current;
    if (hint && current.status !== "signed-in") apply({ status: "signed-in", user: null, key: newKey() });
    else if (!hint && current.status !== "anonymous") apply(ANONYMOUS);
  }, [enabled, apply]);

  // Au montage (juste après l'hydratation), puis à chaque navigation.
  useEffect(() => {
    sync();
  }, [sync, pathname]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [sync]);

  const identify = useCallback<SessionContext["identify"]>(
    (user, forKey) => {
      const current = stateRef.current;
      // Réponse d'une session déjà remplacée (déconnexion, autre compte) : ignorée.
      if (current.status !== "signed-in" || current.key !== forKey) return;
      if (!user) {
        // Session expirée ou révoquée : la réponse du serveur a déjà remplacé l'indice (marque « refusée » ou effacement).
        apply(ANONYMOUS);
        return;
      }
      // Autre compte ouvert entre-temps dans un autre onglet : nouvelle clé, les données du compte sont rechargées.
      if (current.user && current.user.uid !== user.uid) {
        apply({ status: "signed-in", user, key: newKey() });
        return;
      }
      const same = current.user && current.user.name === user.name && current.user.email === user.email && current.user.picture === user.picture;
      if (!same) apply({ ...current, user });
    },
    [apply],
  );

  const signedIn = useCallback<SessionContext["signedIn"]>((user) => apply({ status: "signed-in", user, key: newKey() }), [apply]);

  const signedOut = useCallback(() => {
    clearHint();
    apply(ANONYMOUS);
  }, [apply]);

  const value = useMemo<SessionContext>(() => ({ ...state, identify, signedIn, signedOut }), [state, identify, signedIn, signedOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession doit être utilisé sous SessionProvider.");
  return ctx;
}
