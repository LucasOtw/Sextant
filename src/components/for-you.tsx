"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { EyeOffIcon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { useFavorites } from "@/components/favorites/favorites-provider";
import { WorkCard } from "@/components/work-card";
import { Skeleton } from "@/components/ui/skeleton";
import { shortId } from "@/lib/openalex";
import { readRecent } from "@/lib/recent";
import { hideRecommendation, readHidden, reasonText, unhideRecommendation, type Recommendation } from "@/lib/recommendations-shared";

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
  const waiting = favorites.enabled && !favorites.ready && !favorites.error;
  // Graines figées une fois les favoris prêts, recalculées seulement à la connexion ou à la déconnexion : un cœur
  // cliqué pendant la visite ne relance pas la requête et ne réorganise pas la grille sous le pointeur (la carte
  // qu'on vient d'enregistrer en sortirait). Les nouveaux favoris comptent au prochain affichage de l'accueil.
  const [seed, setSeed] = useState<{ enabled: boolean; key: string } | null>(null);
  if (!waiting && (seed === null || seed.enabled !== favorites.enabled)) {
    setSeed({ enabled: favorites.enabled, key: favorites.favoriteIds.slice(0, 30).join(",") });
  }
  const favKey = seed?.key ?? null;

  useEffect(() => {
    // Connecté : on attend les favoris pour ne faire qu'une requête.
    if (favKey === null) return;
    const seen = readRecent().map((r) => r.id).slice(0, 12);
    const fav = favKey ? favKey.split(",") : [];
    if (seen.length === 0 && fav.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- dépend du stockage local, lisible seulement après hydratation
      setState({ status: "hidden", items: [], fromFavorites: false });
      return;
    }
    const ctrl = new AbortController();
    setState((s) => ({ ...s, status: s.items.length ? s.status : "loading" }));
    const q = new URLSearchParams({ seen: seen.join(","), fav: fav.join(","), hide: readHidden().slice(0, 200).join(",") });
    fetch(`/api/recommendations?${q}`, { signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { items: Recommendation[] }) => setState({ status: data.items.length ? "ready" : "hidden", items: data.items, fromFavorites: fav.length > 0 }))
      .catch(() => {
        // Un échec de rechargement (429, panne OpenAlex) garde les suggestions déjà affichées.
        if (!ctrl.signal.aborted) setState((s) => (s.items.length ? s : { status: "hidden", items: [], fromFavorites: false }));
      });
    return () => ctrl.abort();
  }, [favKey]);

  function dismiss(item: Recommendation) {
    const id = shortId(item.work.id);
    hideRecommendation(id);
    setState((s) => {
      const items = s.items.filter((x) => shortId(x.work.id) !== id);
      return { ...s, items, status: items.length ? s.status : "hidden" };
    });
    toast("Suggestion écartée.", {
      description: "Elle ne vous sera plus proposée.",
      action: {
        label: "Annuler",
        onClick: () => {
          unhideRecommendation(id);
          setState((s) => ({ ...s, status: "ready", items: s.items.some((x) => shortId(x.work.id) === id) ? s.items : [...s.items, item] }));
        },
      },
    });
  }

  if (state.status === "idle" || state.status === "hidden") return null;

  return (
    <section id="pour-vous" className="py-8 animate-in fade-in duration-500 motion-reduce:animate-none">
      <div className="mb-5">
        <h2 className="title-display flex items-center gap-2 text-3xl sm:text-4xl">
          <SparklesIcon className="size-7 text-accent-brand" aria-hidden /> Pour vous
        </h2>
        <p className="mt-1.5 text-base text-muted-foreground">
          {state.fromFavorites
            ? "À partir de vos favoris et de ce que vous avez consulté : des articles apparentés, et les plus cités de vos sujets. Rien n'est gardé côté serveur."
            : "À partir de ce que vous avez consulté sur cet appareil : des articles apparentés, et les plus cités de vos sujets. Rien n'est gardé côté serveur."}
        </p>
      </div>
      {state.status === "loading" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                        {kind === "related" ? "Proche de " : topic ? `Récent et cité sur « ${topic} », comme ` : "Même sujet que "}
                        {seeds.map((seed, j) => (
                          <Fragment key={seed.id}>
                            {j > 0 && (j === seeds.length - 1 ? " et " : ", ")}
                            <Link
                              href={`/article/${seed.id}`}
                              aria-label={`« ${seed.title} »`}
                              className="underline underline-offset-2 hover:text-foreground"
                            >
                              « {shortTitle(seed.title)} »
                            </Link>
                          </Fragment>
                        ))}
                      </>
                    ) : (
                      reasonText(item.reason)
                    )}
                  </p>
                  <button type="button" onClick={() => dismiss(item)} className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 hover:bg-secondary hover:text-foreground" aria-label={`Pas intéressé : ${item.work.display_name ?? "cet article"}`}>
                    <EyeOffIcon className="size-3.5" aria-hidden /> Pas intéressé
                  </button>
                </div>
                <WorkCard work={item.work} variant="compact" />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
