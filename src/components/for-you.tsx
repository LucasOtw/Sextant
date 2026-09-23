"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SparklesIcon } from "lucide-react";
import { WorkCard } from "@/components/work-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Work } from "@/lib/openalex";
import { readRecent } from "@/lib/recent";

interface Item {
  work: Work;
  reason: { topic: string; seedId: string; seedTitle: string };
}

/**
 * « Pour vous » : nourri par l'historique local de consultation (rien n'est envoyé ni gardé côté serveur au-delà
 * des identifiants de la requête). Chaque suggestion dit pourquoi elle est là. Masqué sans historique.
 */
export function ForYou() {
  const [state, setState] = useState<{ status: "idle" | "loading" | "ready" | "hidden"; items: Item[] }>({ status: "idle", items: [] });

  useEffect(() => {
    const recent = readRecent();
    if (recent.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- dépend du stockage local, lisible seulement après hydratation
      setState({ status: "hidden", items: [] });
      return;
    }
    const ctrl = new AbortController();
    setState({ status: "loading", items: [] });
    fetch(`/api/recommendations?seen=${recent.map((r) => r.id).slice(0, 8).join(",")}`, { signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { items: Item[] }) => setState({ status: data.items.length ? "ready" : "hidden", items: data.items }))
      .catch(() => {
        if (!ctrl.signal.aborted) setState({ status: "hidden", items: [] });
      });
    return () => ctrl.abort();
  }, []);

  if (state.status === "idle" || state.status === "hidden") return null;

  return (
    <section id="pour-vous" className="scroll-mt-20 py-8 animate-in fade-in duration-500 motion-reduce:animate-none">
      <div className="mb-5">
        <h2 className="title-display flex items-center gap-2 text-3xl sm:text-4xl">
          <SparklesIcon className="size-7 text-accent-brand" aria-hidden /> Pour vous
        </h2>
        <p className="mt-1.5 text-base text-muted-foreground">
          Des articles récents et cités sur les sujets de ce que vous avez consulté. Calculé à partir de l'historique de cet appareil, rien n'est gardé côté serveur.
        </p>
      </div>
      {state.status === "loading" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {state.items.map((item, i) => (
            <li key={item.work.id} className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-400 motion-reduce:animate-none" style={{ animationDelay: `${i * 50}ms` }}>
              <p className="truncate px-1 text-xs text-muted-foreground" title={`Sujet : ${item.reason.topic}`}>
                Parce que vous avez consulté{" "}
                <Link href={`/article/${item.reason.seedId}`} className="underline underline-offset-2 hover:text-foreground">« {item.reason.seedTitle} »</Link>
              </p>
              <WorkCard work={item.work} variant="compact" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
