import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BookOpenIcon, ExternalLinkIcon, FileTextIcon, LockOpenIcon, QuoteIcon } from "lucide-react";
import { AiSummary } from "@/components/ai-summary";
import { AuthorChip } from "@/components/author-chip";
import { FavoriteButton } from "@/components/favorites/favorite-button";
import { CollectionPicker } from "@/components/collections/collection-picker";
import { snapshotFromWork } from "@/lib/favorites-shared";
import { getCurrentUser, isAuthEnabled } from "@/lib/auth";
import { isFavorite } from "@/lib/favorites";
import { TrackView } from "@/components/track-view";
import { CopyButton } from "@/components/copy-button";
import { WorkCard } from "@/components/work-card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  abstractFromInvertedIndex,
  formatAuthors,
  formatCount,
  formatDate,
  languageName,
  oaLabel,
  openAccessUrl,
  publisherUrl,
  toApa,
  toBibtex,
  typeLabel,
  venueName,
  workTitle,
} from "@/lib/format";
import { getWork, getWorksByIds, getWorksBySameTopic, shortId, type Work } from "@/lib/openalex";
import { themeByFieldId } from "@/lib/themes";
import { activeProvider, modelFor, providerLabel } from "@/lib/ai";
import { cn } from "cn";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const work = await getWork((await params).id).catch(() => null);
  if (!work) return { title: "Article introuvable" };
  const abstract = abstractFromInvertedIndex(work.abstract_inverted_index);
  return { title: workTitle(work), description: abstract?.slice(0, 160) };
}

export default async function ArticlePage({ params }: Props) {
  const { id } = await params;
  if (!/^W\d+$/i.test(id)) notFound();
  const work = await getWork(id);
  if (!work) notFound();

  const abstract = abstractFromInvertedIndex(work.abstract_inverted_index);
  const oa = openAccessUrl(work);
  const publisher = publisherUrl(work);
  const venue = venueName(work);
  const theme = work.primary_topic?.field ? themeByFieldId(work.primary_topic.field.id) : undefined;
  const provider = activeProvider();
  const aiEnabled = provider !== null && Boolean(abstract);
  // Cœur déjà dans le bon état au premier rendu pour un utilisateur connecté (une lecture Firestore).
  const sessionUser = isAuthEnabled() ? await getCurrentUser() : null;
  const initiallyFavorite = sessionUser ? await isFavorite(sessionUser.uid, shortId(work.id)).catch(() => false) : false;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <TrackView
        id={shortId(work.id)}
        title={workTitle(work)}
        authors={formatAuthors(work, 2)}
        venue={venue}
        year={work.publication_year}
        isOa={work.open_access.is_oa}
      />
      <article className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <Badge variant="secondary">{typeLabel(work.type)}</Badge>
          <Badge className={cn(work.open_access.is_oa ? "bg-oa text-oa-foreground" : "bg-muted text-muted-foreground")}>
            {work.open_access.is_oa && <LockOpenIcon aria-hidden />}
            {oaLabel(work.open_access.oa_status)}
          </Badge>
          {work.is_retracted && <Badge variant="destructive">Rétracté</Badge>}
          {theme && (
            <Link href={`/theme/${theme.slug}`} className="ml-1 text-muted-foreground hover:text-foreground">
              {theme.name}
            </Link>
          )}
        </div>

        <h1 className="title-display mt-4 text-3xl leading-tight sm:text-[2.6rem] sm:leading-[1.15]">{workTitle(work)}</h1>

        <Authors work={work} />

        <p className="mt-3 text-[15px] text-muted-foreground">
          {venue && <span className="italic text-foreground">{venue}</span>}
          {venue && (work.publication_date || work.publication_year) && " · "}
          {formatDate(work.publication_date) ?? work.publication_year}
          {work.biblio?.volume && <>, vol. {work.biblio.volume}</>}
          {work.biblio?.issue && <> ({work.biblio.issue})</>}
          {work.biblio?.first_page && (
            <>, p. {work.biblio.first_page}{work.biblio.last_page ? `–${work.biblio.last_page}` : ""}</>
          )}
          {work.language && <> · {work.language.toUpperCase()}</>}
        </p>

        <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
          <Stat icon={<QuoteIcon />} label="Citations">
            <Link href={`/search?cites=${shortId(work.id)}`} className="underline underline-offset-2 hover:text-accent-brand">
              {formatCount(work.cited_by_count)}
            </Link>
          </Stat>
          {typeof work.referenced_works_count === "number" && (
            <Stat icon={<BookOpenIcon />} label="Références">{formatCount(work.referenced_works_count)}</Stat>
          )}
          {work.doi && (
            <Stat label="DOI">
              <a href={work.doi} target="_blank" rel="noreferrer" className="font-mono text-xs underline underline-offset-2 hover:text-accent-brand">
                {work.doi.replace(/^https?:\/\/doi\.org\//, "")}
              </a>
            </Stat>
          )}
        </dl>

        <div className="mt-5 flex flex-wrap gap-2">
          {oa && (
            <a href={oa.url} target="_blank" rel="noreferrer" className={buttonVariants({ size: "lg", className: "px-3.5" })}>
              <FileTextIcon /> {oa.isPdf ? "Lire le PDF" : "Lire en accès ouvert"}
            </a>
          )}
          {publisher && (
            <a href={publisher} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "lg", className: "bg-card px-3.5" })}>
              <ExternalLinkIcon /> Voir chez l'éditeur
            </a>
          )}
          <CopyButton text={toApa(work)} label="Citer (APA)" size="lg" className="bg-card px-3.5" />
          <CopyButton text={toBibtex(work)} label="BibTeX" size="lg" className="bg-card px-3.5" />
          {isAuthEnabled() && <FavoriteButton snapshot={snapshotFromWork(work)} variant="button" initialActive={initiallyFavorite} className="px-3.5" />}
          {isAuthEnabled() && <CollectionPicker snapshot={snapshotFromWork(work)} variant="button" className="px-3.5" />}
        </div>
        {!oa && (
          <p className="mt-2 text-sm text-muted-foreground">
            Pas de version en accès ouvert connue. Le lien éditeur peut demander un abonnement institutionnel.
          </p>
        )}

        <Separator className="my-8" />

        <section aria-labelledby="abstract">
          <h2 id="abstract" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Résumé
            {work.language && work.language !== "fr" && (
              <span className="ml-2 font-normal normal-case tracking-normal">· en {languageName(work.language)}</span>
            )}
          </h2>
          {abstract ? (
            <p className="mt-3 text-[17px] leading-relaxed">{abstract}</p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Résumé non disponible dans OpenAlex — consultez la page de l'éditeur.</p>
          )}
          {aiEnabled && provider && (
            <AiSummary
              workId={shortId(work.id)}
              providerLabel={providerLabel(provider)}
              model={modelFor(provider)}
              isFrench={work.language === "fr"}
            />
          )}
        </section>

        {(work.topics?.length || work.keywords?.length) && (
          <section className="mt-8" aria-labelledby="topics">
            <h2 id="topics" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Sujets</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {work.topics?.slice(0, 3).map((t) => (
                <Link key={t.id} href={`/search?topic=${shortId(t.id)}`}>
                  <Badge variant="secondary" className="h-7 cursor-pointer px-3 text-sm">{t.display_name}</Badge>
                </Link>
              ))}
              {work.keywords?.slice(0, 6).map((k) => (
                <Link key={k.id} href={`/search?q=${encodeURIComponent(k.display_name)}`}>
                  <Badge variant="outline" className="h-7 cursor-pointer px-3 text-sm">{k.display_name}</Badge>
                </Link>
              ))}
            </div>
          </section>
        )}
      </article>

      <section className="mt-14" aria-labelledby="similar">
        <h2 id="similar" className="title-display text-3xl sm:text-4xl">Pour aller plus loin</h2>
        <p className="mt-1.5 text-base text-muted-foreground">Articles proches par le contenu, selon OpenAlex.</p>
        <Suspense fallback={<SimilarSkeleton />}>
          <Similar work={work} />
        </Suspense>
      </section>
    </div>
  );
}

function Authors({ work }: { work: Work }) {
  const MAX = 12;
  const list = work.authorships;
  const shown = list.slice(0, MAX);
  const rest = list.length - shown.length;
  if (list.length === 0) return null;
  return (
    <p className="mt-4 text-[15px] leading-relaxed">
      {shown.map((a, i) => {
        const inst = a.institutions[0]?.display_name;
        return (
          <span key={`${a.author.id ?? a.author.display_name}-${i}`}>
            <AuthorChip authorId={a.author.id} name={a.author.display_name} institution={inst} institutionId={a.institutions[0]?.id ?? null} />
            {inst && <span className="text-muted-foreground"> ({inst})</span>}
            {i < shown.length - 1 && ", "}
          </span>
        );
      })}
      {rest > 0 && <span className="text-muted-foreground"> et {rest} autre{rest > 1 ? "s" : ""}</span>}
    </p>
  );
}

function Stat({ icon, label, children }: { icon?: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      {icon && <span className="text-accent-brand [&_svg]:size-4" aria-hidden>{icon}</span>}
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

async function Similar({ work }: { work: Work }) {
  let similar: Work[] = [];
  try {
    similar = await getWorksByIds(work.related_works ?? []);
    if (similar.length < 3 && work.primary_topic) {
      const more = await getWorksBySameTopic(work.primary_topic.id, work.id, 6);
      const seen = new Set(similar.map((w) => w.id));
      similar = [...similar, ...more.filter((w) => !seen.has(w.id))];
    }
  } catch {
    return <p className="mt-4 text-sm text-muted-foreground">Suggestions indisponibles pour le moment.</p>;
  }
  if (similar.length === 0) return <p className="mt-4 text-sm text-muted-foreground">Aucune suggestion pour cet article.</p>;
  return (
    <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {similar.slice(0, 9).map((w, i) => (
        <li key={w.id} className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-400 motion-reduce:animate-none" style={{ animationDelay: `${i * 50}ms` }}>
          <WorkCard work={w} variant="compact" />
        </li>
      ))}
    </ul>
  );
}

function SimilarSkeleton() {
  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
    </div>
  );
}
