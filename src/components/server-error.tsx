"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckIcon, CopyIcon, HomeIcon, RotateCwIcon } from "lucide-react";
import { ErrorScene } from "@/components/error-scene";
import { Button, buttonVariants } from "@/components/ui/button";

interface Props {
  error: Error & { digest?: string };
  retry: () => void;
}

/** Contenu commun des erreurs serveur : page (error.tsx) et document entier (global-error.tsx). */
export function ServerError({ error, retry }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Trace côté navigateur ; la même référence (digest) se retrouve dans les journaux Vercel.
    console.error("[Sextant] erreur d'affichage", error.digest ?? "", error);
  }, [error]);

  const reference = error.digest ?? null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-12 sm:px-6 sm:py-16">
      <ErrorScene variant="storm" />
      <div className="flex flex-col items-center gap-3 text-center" role="alert">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent-brand">Erreur serveur</p>
        <h1 className="title-display text-4xl leading-tight sm:text-5xl">Mer agitée, visibilité réduite</h1>
        <p className="max-w-lg text-balance text-lg text-muted-foreground">
          Sextant n'a pas pu afficher cette page. Le plus souvent, une source de données comme OpenAlex répond mal ou trop lentement :
          réessayez dans un instant.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button size="lg" onClick={() => retry()}><RotateCwIcon /> Réessayer</Button>
        <Link href="/" className={buttonVariants({ variant: "outline", size: "lg", className: "bg-card" })}><HomeIcon /> Retour à l'accueil</Link>
      </div>
      <div className="flex flex-col items-center gap-1.5 text-center text-sm text-muted-foreground">
        <p>
          Ça persiste ? <Link href="/retours" className="text-accent-brand underline underline-offset-3">Signalez-le dans Bugs et idées</Link>
          {reference && <>, en indiquant la référence ci-dessous</>}.
        </p>
        {reference && (
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(reference);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              } catch {
                /* presse-papiers indisponible : la référence reste lisible */
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-xs hover:bg-secondary hover:text-foreground"
            aria-label={copied ? "Référence copiée" : `Copier la référence ${reference}`}
          >
            Référence : {reference} {copied ? <CheckIcon className="size-3.5" aria-hidden /> : <CopyIcon className="size-3.5" aria-hidden />}
          </button>
        )}
      </div>
    </div>
  );
}
