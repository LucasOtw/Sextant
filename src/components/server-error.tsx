"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CheckIcon, CopyIcon, HomeIcon, RotateCwIcon } from "lucide-react";
import { ErrorScene } from "@/components/error-scene";
import { Button, buttonVariants } from "@/components/ui/button";
import { useCopy } from "@/hooks/use-copy";

interface Props {
  error: Error & { digest?: string };
  retry: () => void;
}

/** Contenu commun des erreurs serveur : page (error.tsx) et document entier (global-error.tsx). */
export function ServerError({ error, retry }: Props) {
  const { copied, copy } = useCopy();

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
        <h1 className="title-display type-h1">Mer agitée, visibilité réduite</h1>
        <p className="lead">
          Sextant n'a pas pu afficher cette page. Le plus souvent, une source de données comme OpenAlex répond mal ou trop lentement :
          réessayez dans un instant.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button size="lg" onClick={() => retry()}><RotateCwIcon /> Réessayer</Button>
        <Link href="/" className={buttonVariants({ variant: "outline", size: "lg" })}><HomeIcon /> Retour à l'accueil</Link>
      </div>
      <div className="flex flex-col items-center gap-1.5 text-center text-sm text-muted-foreground">
        <p>
          Ça persiste&#8239;? <Link href="/retours" className="link">Signalez-le dans Bugs et idées</Link>
          {reference && <>, en indiquant la référence ci-dessous</>}.
        </p>
        {reference && (
          <Button
            variant="ghost"
            size="xs"
            // Presse-papiers indisponible : la référence reste lisible.
            onClick={() => void copy(reference, { message: "Référence copiée." })}
            className="font-normal tabular-nums text-muted-foreground"
            aria-label={copied ? "Référence copiée" : `Copier la référence ${reference}`}
          >
            Référence&nbsp;: {reference} {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
          </Button>
        )}
      </div>
    </div>
  );
}
