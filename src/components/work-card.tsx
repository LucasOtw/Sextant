import Link from "next/link";
import { LockOpenIcon, QuoteIcon } from "lucide-react";
import type { Work } from "@/lib/openalex";
import { shortId } from "@/lib/openalex";
import {
  abstractFromInvertedIndex,
  formatAuthors,
  formatCount,
  truncateWords,
  typeLabel,
  venueName,
  workTitle,
} from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { cn } from "cn";

interface Props {
  work: Work;
  variant?: "list" | "compact";
}

export function WorkCard({ work, variant = "list" }: Props) {
  const href = `/article/${shortId(work.id)}`;
  const venue = venueName(work);
  const abstract = abstractFromInvertedIndex(work.abstract_inverted_index);
  const compact = variant === "compact";

  return (
    <article
      className={cn(
        "group relative flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-shadow hover:shadow-md hover:ring-foreground/25",
        compact ? "h-full" : "sm:p-5",
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <Badge variant="secondary">{typeLabel(work.type)}</Badge>
        {work.open_access.is_oa && (
          <Badge className="bg-oa text-oa-foreground">
            <LockOpenIcon aria-hidden /> Accès ouvert
          </Badge>
        )}
        {work.primary_topic && !compact && (
          <span className="truncate">· {work.primary_topic.display_name}</span>
        )}
      </div>

      <h3 className={cn("title-display leading-snug", compact ? "text-lg" : "text-xl sm:text-[1.4rem]")}>
        <Link href={href} className="after:absolute after:inset-0 hover:text-accent-brand">
          {workTitle(work)}
        </Link>
      </h3>

      <p className="text-[15px] text-muted-foreground">
        {formatAuthors(work, compact ? 2 : 3)}
        {venue && <> · <span className="italic">{venue}</span></>}
        {work.publication_year && <> · {work.publication_year}</>}
        {work.language && work.language !== "en" && (
          <> · <span className="font-medium uppercase">{work.language}</span></>
        )}
      </p>

      {!compact && abstract && (
        <p className="text-[15px] leading-relaxed text-foreground/80">{truncateWords(abstract, 45)}</p>
      )}

      <div className="mt-auto flex items-center gap-1 pt-1 text-sm text-muted-foreground">
        <QuoteIcon className="size-4 text-accent-brand" aria-hidden />
        {formatCount(work.cited_by_count)} citation{work.cited_by_count > 1 ? "s" : ""}
      </div>
    </article>
  );
}
