"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { EyeIcon, EyeOffIcon, SparklesIcon } from "lucide-react";
import { useFavorites } from "@/components/favorites/favorites-provider";
import { WorkCard } from "@/components/work-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { shortId } from "@/lib/ids";
import { readRecent } from "@/lib/recent";
import { clearHidden, forYouStatus, hideRecommendation, readHidden, reasonText, RECO_LIMITS, unhideRecommendation, type Recommendation } from "@/lib/recommendations-shared";
import { undoToast } from "@/lib/undo-toast";
import { useFocusRecovery } from "@/hooks/use-focus-recovery";

type State = { status: "idle" | "loading" | "ready" | "hidden"; items: Recommendation[]; fromFavorites: boolean };

/** Raccourcit un titre d'article d'origine trop long pour la ligne de raison (le titre entier reste dans le nom accessible). */
function shortTitle(title: string): string {
  return title.length > 70 ? `${title.slice(0, 67).trimEnd()}…` : title;
}

/**
 * « Pour vous » : vos favoris (si vous êtes connecté) et vos consultations sur cet appareil, envoyés à la volée pour calculer
 * des suggestions ; rien n'est gardé côté serveur. Chaque suggestion dit pourquoi elle est là, et peut être écartée.
 */
export function ForYou() {
  const favorites = useFavorites();
  const [state, setState] = useState<State>({ status: "idle", items: [], fromFavorites: false });
  // On attend aussi de savoir si le visiteur est connecté (page en cache, session lue côté client : PERF-01).
  const waiting = favorites.pending || (favorites.enabled && !favorites.ready && !favorites.error);
  // Graines figées une fois les favoris prêts, recalculées seulement à la connexion ou à la déconnexion : un cœur
  // cliqué pendant la visite ne relance pas la requête et ne réorganise pas la grille sous le pointeur (la carte
  // qu'on vient d'enregistrer en sortirait). Les nouveaux favoris comptent au prochain affichage de l'accueil.
  const [seed, setSeed] = useState<{ enabled: boolean; key: string } | null>(null);
  if (!waiting && (seed === null || seed.enabled !== favorites.enabled)) {
    setSeed({ enabled: favorites.enabled, key: favorites.favoriteIds.slice(0, RECO_LIMITS.fav).join(",") });
  }
  const favKey = seed?.key ?? null;
  /** Suggestions écartées sur cet appareil : un bouton permet de les réafficher (le toast « Annuler » n'est pas le seul recours). */
  const [hiddenCount, setHiddenCount] = useState(0);
  /** Relance du calcul après « Réafficher les suggestions écartées ». */
  const [reload, setReload] = useState(0);
  /** Le bouton « Réafficher » disparaît au clic : le focus va au titre de la section plutôt que sur la page. */
  const headingRef = useRef<HTMLHeadingElement>(null);
  /** Carte écartée : le focus passe au « Pas intéressé » de la suivante (ou de la précédente), sinon au titre (A11Y-19). */
  const listRef = useRef<HTMLUListElement>(null);
  useFocusRecovery(listRef, ":scope > li", () => headingRef.current);

  useEffect(() => {
    // Connecté : on attend les favoris pour ne faire qu'une requête.
    if (favKey === null) return;
    const seen = readRecent().map((r) => r.id).slice(0, RECO_LIMITS.seen);
    const fav = favKey ? favKey.split(",") : [];
    if (seen.length === 0 && fav.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- dépend du stockage local, lisible seulement après hydratation
      setState({ status: "hidden", items: [], fromFavorites: false });
      return;
    }
    const ctrl = new AbortController();
    setState((s) => ({ ...s, status: s.items.length ? s.status : "loading" }));
    const q = new URLSearchParams({ seen: seen.join(","), fav: fav.join(","), hide: readHidden().slice(0, RECO_LIMITS.hide).join(",") });
    fetch(`/api/recommendations?${q}`, { signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { items: Recommendation[] }) => {
        const hidden = readHidden().length;
        setState({ status: forYouStatus(data.items.length, hidden), items: data.items, fromFavorites: fav.length > 0 });
        setHiddenCount(hidden);
      })
      .catch(() => {
        // Un échec de rechargement (429, panne OpenAlex) garde les suggestions déjà affichées.
        if (!ctrl.signal.aborted) setState((s) => (s.items.length ? s : { status: "hidden", items: [], fromFavorites: false }));
      });
    return () => ctrl.abort();
  }, [favKey, reload]);

  function dismiss(item: Recommendation) {
    const id = shortId(item.work.id);
    hideRecommendation(id);
    // La section reste affichée quand tout est écarté : titre (qui reçoit le focus) et « Réafficher » ne disparaissent pas.
    setState((s) => ({ ...s, items: s.items.filter((x) => shortId(x.work.id) !== id) }));
    setHiddenCount(readHidden().length);
    undoToast(
      "Suggestion écartée.",
      () => {
        unhideRecommendation(id);
        setHiddenCount(readHidden().length);
        setState((s) => ({ ...s, status: "ready", items: s.items.some((x) => shortId(x.work.id) === id) ? s.items : [...s.items, item] }));
      },
      "Elle ne vous sera plus proposée.",
    );
  }

  function showHidden() {
    clearHidden();
    setHiddenCount(0);
    setReload((n) => n + 1);
    headingRef.current?.focus();
  }

  if (state.status === "idle" || state.status === "hidden") return null;

  return (
    <section id="pour-vous" className="py-8 animate-in fade-in duration-500 motion-reduce:animate-none">
      <div className="mb-5">
        <h2 ref={headingRef} tabIndex={-1} className="title-display type-h2 flex items-center gap-2 outline-none">
          <SparklesIcon className="size-7 text-brand" aria-hidden /> Pour vous
        </h2>
        <p className="mt-1.5 max-w-measure-text text-muted-foreground">
          {state.fromFavorites
            ? "À partir de vos favoris et de ce que vous avez consulté : des articles apparentés, et les plus cités de vos sujets. Rien n'est gardé côté serveur."
            : "À partir de ce que vous avez consulté sur cet appareil : des articles apparentés, et les plus cités de vos sujets. Rien n'est gardé côté serveur."}
        </p>
      </div>
      {state.status === "loading" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      ) : state.items.length === 0 ? (
        <p className="text-meta text-muted-foreground">Vous avez écarté toutes les suggestions.</p>
      ) : (
        <ul ref={listRef} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {state.items.map((item, i) => {
            const { kind, topic, seeds } = item.reason;
            return (
              <li key={item.work.id} className="flex min-w-0 flex-col gap-1.5 animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-400 motion-reduce:animate-none" style={{ animationDelay: `${i * 50}ms` }}>
                <div className="flex items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
                  {/* Raison complète (sujet et tous les articles d'origine), jamais tronquée par la hauteur : chaque lien reste visible
                      et focalisable. Seuls les titres très longs sont raccourcis, le titre entier restant dans le nom accessible du lien. */}
                  <p className="min-w-0 wrap-break-word">
                    {seeds.length > 0 ? (
                      <>
                        {kind === "related" ? "Proche de " : topic ? `Récent et cité sur «\u00A0${topic}\u00A0», comme ` : "Même sujet que "}
                        {seeds.map((seed, j) => (
                          <Fragment key={seed.id}>
                            {j > 0 && (j === seeds.length - 1 ? " et " : ", ")}
                            <Link
                              href={`/article/${seed.id}`}
                              aria-label={`« ${seed.title} »`}
                              className="link-quiet"
                            >
                              «&nbsp;{shortTitle(seed.title)}&nbsp;»
                            </Link>
                          </Fragment>
                        ))}
                      </>
                    ) : (
                      reasonText(item.reason)
                    )}
                  </p>
                  <Button variant="ghost" size="xs" data-focus-key="dismiss" onClick={() => dismiss(item)} className="text-muted-foreground" aria-label={`Pas intéressé : ${item.work.display_name ?? "cet article"}`}>
                    <EyeOffIcon aria-hidden /> Pas intéressé
                  </Button>
                </div>
                <WorkCard work={item.work} variant="compact" />
              </li>
            );
          })}
        </ul>
      )}
      {state.status === "ready" && hiddenCount > 0 && (
        <Button variant="ghost" size="sm" onClick={showHidden} className="mt-4 text-muted-foreground">
          <EyeIcon aria-hidden /> Réafficher les suggestions écartées ({hiddenCount})
        </Button>
      )}
    </section>
  );
}
