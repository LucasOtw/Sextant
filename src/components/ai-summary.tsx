"use client";

import { useState } from "react";
import { SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  workId: string;
}

type State = { status: "idle" } | { status: "loading" } | { status: "done"; text: string } | { status: "error"; message: string };

export function AiSummary({ workId }: Props) {
  const [state, setState] = useState<State>({ status: "idle" });

  async function run() {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/summary", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: workId }),
      });
      const data = (await res.json()) as { summary?: string; error?: string };
      if (!res.ok || !data.summary) throw new Error(data.error ?? "Résumé indisponible.");
      setState({ status: "done", text: data.summary });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Erreur inconnue." });
    }
  }

  return (
    <section aria-labelledby="ai-summary" className="rounded-xl border border-dashed p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ai-summary" className="flex items-center gap-2 text-sm font-medium">
          <SparklesIcon className="size-4 text-accent-brand" aria-hidden />
          Résumé IA
        </h2>
        {state.status !== "done" && (
          <Button size="sm" variant="secondary" onClick={run} disabled={state.status === "loading"}>
            {state.status === "loading" ? "Génération…" : "Générer un résumé"}
          </Button>
        )}
      </div>

      {state.status === "idle" && (
        <p className="mt-2 text-sm text-muted-foreground">
          Une synthèse en français, générée à la demande à partir du résumé original. Indicative : la source fait foi.
        </p>
      )}
      {state.status === "loading" && (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      )}
      {state.status === "done" && (
        <div className="mt-3 space-y-2 text-sm leading-relaxed">
          {state.text.split(/\n+/).map((line, i) => <p key={i}>{line}</p>)}
          <p className="pt-1 text-xs text-muted-foreground">Généré par IA à partir du résumé original — vérifiez dans l'article.</p>
        </div>
      )}
      {state.status === "error" && <p className="mt-2 text-sm text-destructive">{state.message}</p>}
    </section>
  );
}
