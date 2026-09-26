import type { ReactNode } from "react";
import Link from "next/link";
import { LockOpenIcon, QuoteIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCount, typeLabel } from "@/lib/format";
import { cn } from "cn";

/**
 * Blocs communs des cartes d'article (QUAL-13) : résultats de recherche (WorkCard), /favoris et page publique d'une
 * liste. Une évolution (badge, accessibilité) se fait ici une fois. Sans état : utilisables côté serveur comme client.
 */

/** Type, accès ouvert, rétractation et sujet. */
export function ArticleBadges({ type, isOa, retracted = false, topic, className }: { type: string; isOa: boolean; retracted?: boolean; topic?: string | null; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground", className)}>
      <Badge variant="secondary">{typeLabel(type)}</Badge>
      {isOa && (
        <Badge className="bg-oa text-oa-foreground">
          <LockOpenIcon aria-hidden /> Accès ouvert
        </Badge>
      )}
      {retracted && <Badge variant="destructive">Rétracté</Badge>}
      {topic && <span className="truncate">· {topic}</span>}
    </div>
  );
}

/**
 * Titre en lien étiré : toute la carte mène à la fiche. Niveau de titre selon la page (h2 sous le h1, h3 sous un h2).
 * Une taille de texte passée dans `className` remplace l'interligne (fusion Tailwind) : la redonner après si besoin.
 */
export function ArticleTitle({ href, as: Tag = "h3", lang, className, children }: { href: string; as?: "h2" | "h3"; lang?: string; className?: string; children: ReactNode }) {
  return (
    <Tag lang={lang} className={cn("title-display leading-snug", className)}>
      <Link href={href} className="after:absolute after:inset-0 hover:text-accent-brand">
        {children}
      </Link>
    </Tag>
  );
}

/** « Auteurs · Revue · Année », et la langue quand elle n'est pas l'anglais. */
export function ArticleMeta({ authors, venue, year, language, className }: { authors: ReactNode; venue: string | null; year: number | null; language?: string | null; className?: string }) {
  return (
    <p className={cn("text-[0.9375rem] text-muted-foreground", className)}>
      {authors}
      {venue && <> · <span className="italic">{venue}</span></>}
      {year && <> · {year}</>}
      {language && language !== "en" && (
        <> · <span className="font-medium uppercase">{language}</span></>
      )}
    </p>
  );
}

/** Icône et nombre de citations reçues (dans le pied de la carte). */
export function CitationCount({ count }: { count: number }) {
  return (
    <>
      <QuoteIcon className="size-4 text-accent-brand" aria-hidden />
      {formatCount(count)} citation{count > 1 ? "s" : ""}
    </>
  );
}
