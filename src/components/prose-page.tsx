import type { ReactNode } from "react";

interface Props {
  title: string;
  intro?: string;
  updated?: string;
  children: ReactNode;
}

/** Gabarit des pages de texte (à propos, conditions, confidentialité). */
export function ProsePage({ title, intro, updated, children }: Props) {
  return (
    <article className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="title-display text-4xl sm:text-5xl">{title}</h1>
      {intro && <p className="mt-4 text-lg text-muted-foreground">{intro}</p>}
      {updated && <p className="mt-2 text-sm text-muted-foreground">Dernière mise à jour : {updated}</p>}
      <div className="prose-sextant mt-10">{children}</div>
    </article>
  );
}
