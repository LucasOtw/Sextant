"use client";

import { useState } from "react";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  workId: string;
  /** Nom du fournisseur affiché (ex. « Mistral AI »). */
  providerLabel: string;
  /** Identifiant du modèle utilisé (ex. « ministral-8b-latest »). */
  model: string;
}

type State = { status: "idle" } | { status: "loading" } | { status: "done"; text: string } | { status: "error"; message: string };

/** Synthèse en français du résumé original, générée à la demande. */
export function AiSummary({ workId, providerLabel, model }: Props) {
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
      if (!res.ok || !data.summary) throw new Error(data.error ?? "Synthèse indisponible.");
      setState({ status: "done", text: data.summary });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Erreur inconnue." });
    }
  }

  const loading = state.status === "loading";

  return (
    <div className="mt-5 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <SparklesIcon className={loading ? "size-4 animate-pulse text-accent-brand" : "size-4 text-accent-brand"} aria-hidden />
            Synthèse en français
          </h3>
          <p className="mt-1 text-[15px] text-muted-foreground">
            Quatre points tirés du résumé ci-dessus : question, méthode, résultat, portée.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground" title={model}>
          <span className="size-1.5 rounded-full bg-accent-brand" aria-hidden />
          Par {providerLabel}
          <span className="hidden font-normal text-muted-foreground sm:inline">· {model}</span>
        </span>
      </div>

      {state.status === "idle" && (
        <Button size="sm" variant="secondary" onClick={run} className="mt-4">
          <SparklesIcon /> Générer la synthèse
        </Button>
      )}

      {loading && (
        <div className="mt-4 space-y-3" aria-live="polite">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" aria-hidden />
            {providerLabel} lit le résumé
            <span className="inline-flex gap-0.5" aria-hidden>
              <Dot delay={0} /><Dot delay={160} /><Dot delay={320} />
            </span>
          </p>
          {[92, 78, 88, 64].map((w, i) => (
            <div key={i} className="shimmer h-4 rounded-md" style={{ width: `${w}%`, animationDelay: `${i * 120}ms` }} />
          ))}
        </div>
      )}

      {state.status === "done" && (
        <div className="mt-4 space-y-2.5 text-[15px] leading-relaxed animate-in fade-in slide-in-from-bottom-1 duration-400 motion-reduce:animate-none">
          {state.text.split(/\n+/).map((line, i) => (
            <p key={i} className="animate-in fade-in fill-mode-backwards duration-500 motion-reduce:animate-none" style={{ animationDelay: `${i * 120}ms` }}>
              {line}
            </p>
          ))}
          <p className="pt-1 text-xs text-muted-foreground">
            Générée par {providerLabel} à partir du résumé original. Indicative : vérifiez dans l'article.
          </p>
        </div>
      )}

      {state.status === "error" && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-sm text-destructive">{state.message}</p>
          <Button size="sm" variant="ghost" onClick={run}>Réessayer</Button>
        </div>
      )}
    </div>
  );
}

function Dot({ delay }: { delay: number }) {
  return <span className="size-1 animate-bounce rounded-full bg-current" style={{ animationDelay: `${delay}ms` }} />;
}
