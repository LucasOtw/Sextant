import type { ReactNode } from "react";
import { frSpaces } from "@/lib/text";

interface Props {
  title: string;
  intro?: string;
  updated?: string;
  children: ReactNode;
}

/**
 * Gabarit des pages de texte (à propos, mentions légales, conditions, confidentialité).
 * Même conteneur et mêmes marges que le header ; colonne de lecture de 52ch, environ 70 caractères (`.prose-sextant`, Y6).
 */
export function ProsePage({ title, intro, updated, children }: Props) {
  return (
    <article className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <header className="max-w-4xl">
        <h1 className="title-display type-h1">{frSpaces(title)}</h1>
        {intro && <p className="lead mt-4">{frSpaces(intro)}</p>}
        {updated && <p className="mt-2 text-sm text-muted-foreground">Dernière mise à jour : {updated}</p>}
      </header>
      <div className="prose-sextant mt-10">{children}</div>
    </article>
  );
}
