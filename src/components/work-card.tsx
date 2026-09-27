import type { Work } from "@/lib/openalex";
import { shortId } from "@/lib/ids";
import { abstractFromInvertedIndex, contentLang, formatAuthors, titleLang, truncateWords, venueName, workTitle } from "@/lib/format";
import { ArticleBadges, ArticleMeta, ArticleTitle, CitationCount } from "@/components/article-card";
import { FavoriteButton } from "@/components/favorites/favorite-button";
import { snapshotFromWork } from "@/lib/favorites-shared";
import { cn } from "@/lib/cn";

interface Props {
  work: Work;
  variant?: "list" | "compact";
}

export function WorkCard({ work, variant = "list" }: Props) {
  const href = `/article/${shortId(work.id)}`;
  const venue = venueName(work);
  const compact = variant === "compact";
  // La variante compacte n'affiche pas le résumé : pas de reconstruction inutile (et « Pour vous » ne l'envoie plus).
  const abstract = compact ? null : abstractFromInvertedIndex(work.abstract_inverted_index);

  return (
    <article
      className={cn(
        "surface-card card-link relative flex flex-col gap-2 wrap-break-word p-4",
        compact ? "h-full" : "sm:p-5",
      )}
    >
      {/* pr-10 : place du cœur, toujours proposé (sans session, il ouvre la connexion). */}
      <ArticleBadges type={work.type} isOa={work.open_access.is_oa} topic={compact ? null : work.primary_topic?.display_name} className="pr-10" />

      <ArticleTitle href={href} lang={titleLang(work)} className={compact ? "text-lg" : "text-xl sm:text-[1.375rem]"}>
        {workTitle(work)}
      </ArticleTitle>
      {/* Le cœur suit le titre dans le DOM (on sait de quel article il s'agit avant d'y arriver), en haut à droite à l'écran (A11Y-23). */}
      <div className="absolute right-3 top-3 z-10">
        <FavoriteButton snapshot={snapshotFromWork(work)} />
      </div>

      <ArticleMeta authors={formatAuthors(work, compact ? 2 : 3)} venue={venue} year={work.publication_year} language={work.language} />

      {!compact && abstract && (
        <p lang={contentLang(work.language)} className="max-w-measure-text text-meta leading-relaxed text-foreground/80">{truncateWords(abstract, 45)}</p>
      )}

      <div className="mt-auto flex items-center gap-1 pt-1 text-sm text-muted-foreground">
        <CitationCount count={work.cited_by_count} />
      </div>
    </article>
  );
}
