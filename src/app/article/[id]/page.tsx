import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BookOpenIcon, ExternalLinkIcon, FileTextIcon, LockIcon, LockOpenIcon, QuoteIcon, SearchIcon } from "lucide-react";
import { AiSummary } from "@/components/ai-summary";
import { SourceUnavailable } from "@/components/source-unavailable";
import { AuthorChip } from "@/components/author-chip";
import { FavoriteButton } from "@/components/favorites/favorite-button";
import { CollectionPicker } from "@/components/collections/collection-picker";
import { ArticleHighlights } from "@/components/highlights/article-highlights";
import { HighlightableAbstract } from "@/components/highlights/highlightable-abstract";
import { HighlightsProvider } from "@/components/highlights/highlights-provider";
import { ReadPdfButton } from "@/components/highlights/read-pdf-button";
import { listHighlights } from "@/lib/highlights";
import { ArticleNote } from "@/components/notes/article-note";
import { getNote } from "@/lib/notes";
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
  contentLang,
  formatAuthors,
  formatCount,
  formatDate,
  languageName,
  oaLabel,
  openAccessPdfUrls,
  openAccessUrl,
  publisherUrl,
  toApa,
  titleLang,
  toBibtex,
  typeLabel,
  venueName,
  workTitle,
} from "@/lib/format";
import { getWork, getWorksByIds, getWorksBySameTopic, OpenAlexError, shortId, type Work } from "@/lib/openalex";
import { themeByFieldId } from "@/lib/themes";
import { activeProvider, modelFor, providerLabel } from "@/lib/ai";
import { cn } from "cn";
import { logError, recover } from "@/lib/log";
import { safeHttpUrl } from "@/lib/text";
import { ExternalLink } from "@/components/external-link";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  // Même contrôle que la page : un identifiant mal formé (« W…?per-page=1 ») ne doit pas emprunter le titre d'un vrai article.
  if (!/^W\d+$/i.test(id)) return { title: "Article introuvable", robots: { index: false } };
  let work: Awaited<ReturnType<typeof getWork>>;
  try {
    work = await getWork(id);
  } catch {
    // Panne de la source (OpenAlex) : le titre ne doit pas parler d'article absent.
    return { title: "Article momentanément indisponible", robots: { index: false } };
  }
  if (!work) return { title: "Article introuvable", robots: { index: false } };
  const abstract = abstractFromInvertedIndex(work.abstract_inverted_index);
  return { title: workTitle(work), description: abstract?.slice(0, 160) };
}

/**
 * Pas de loading.tsx sur ce segment : un squelette démarrerait le flux avec un statut 200 avant `notFound()`,
 * et un article introuvable répondrait « 200 + noindex » (soft 404). Ici l'article est lu avant tout envoi,
 * donc un identifiant absent d'OpenAlex renvoie un vrai 404 (fiche comme lecteur /lire, qui hérite du segment).
 */
export default async function ArticlePage({ params }: Props) {
  const { id } = await params;
  if (!/^W\d+$/i.test(id)) notFound();
  // Lectures personnelles (cœur, surlignages, note) lancées en même temps qu'OpenAlex, pas après (PERF-09) : le
  // chemin critique d'un connecté devient max(OpenAlex, session + Firestore). Un anonyme ne lit rien.
  const sessionUserP = isAuthEnabled() ? getCurrentUser() : Promise.resolve(null);
  const personal = (uid: string, wid: string) =>
    Promise.all([
      isFavorite(uid, wid).catch(recover("article.isFavorite", false)),
      listHighlights(uid, wid).catch(recover("article.highlights", [])),
      getNote(uid, wid).catch(recover("article.note", null)),
    ]);
  const requestedId = id.toUpperCase();
  const personalP = sessionUserP.then((u) => (u ? personal(u.uid, requestedId) : null));
  let work: Work | null;
  try {
    work = await getWork(id);
  } catch (e) {
    if (!(e instanceof OpenAlexError)) throw e;
    logError("article.getWork", e, { work: id });
    return <SourceUnavailable rateLimited={e.isRateLimited} retryHref={`/article/${id}`} />;
  }
  if (!work) notFound();

  const abstract = abstractFromInvertedIndex(work.abstract_inverted_index);
  const oa = openAccessUrl(work);
  // Le lecteur intégré ne s'ouvre que si une copie libre est relayable ; sinon le PDF s'ouvre chez son hébergeur.
  const readable = openAccessPdfUrls(work).length > 0;
  const publisher = publisherUrl(work);
  const doiUrl = safeHttpUrl(work.doi);
  const venue = venueName(work);
  const theme = work.primary_topic?.field ? themeByFieldId(work.primary_topic.field.id) : undefined;
  const provider = activeProvider();
  const aiEnabled = provider !== null && Boolean(abstract);
  // Cœur déjà dans le bon état au premier rendu pour un utilisateur connecté. Notice fusionnée par OpenAlex (identifiant
  // canonique différent de celui demandé, rare) : les données de l'utilisateur sont rangées sous le canonique, on relit.
  const sessionUser = await sessionUserP;
  const workId = shortId(work.id);
  const [initiallyFavorite, initialHighlights, initialNote] = sessionUser
    ? workId === requestedId
      ? ((await personalP) ?? [false, [], null])
      : await personal(sessionUser.uid, workId)
    : [false, [], null];

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
      <HighlightsProvider key={sessionUser?.uid ?? "anon"} enabled={Boolean(sessionUser)} snapshot={snapshotFromWork(work)} retracted={Boolean(work.is_retracted)} initial={initialHighlights}>
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <Badge variant="secondary">{typeLabel(work.type)}</Badge>
          <Badge className={cn(work.open_access.is_oa ? "bg-oa text-oa-foreground" : "bg-muted text-muted-foreground")}>
            {work.open_access.is_oa ? <LockOpenIcon aria-hidden /> : <LockIcon aria-hidden />}
            {oaLabel(work.open_access.oa_status)}
          </Badge>
          {work.is_retracted && <Badge variant="destructive">Rétracté</Badge>}
          {theme && (
            <Link href={`/theme/${theme.slug}`} className="ml-1 text-muted-foreground underline decoration-muted-foreground/50 underline-offset-2 hover:text-foreground hover:decoration-foreground">
              {theme.name}
            </Link>
          )}
        </div>

        {/* Titre et résumé dans la langue de l'article : lus avec la bonne voix par les lecteurs d'écran (A11Y-04). */}
        <h1 lang={titleLang(work)} className="title-display mt-4 text-3xl leading-tight sm:text-[2.6rem] sm:leading-[1.15]">{workTitle(work)}</h1>

        <Authors work={work} />

        <p className="mt-3 text-[0.9375rem] text-muted-foreground">
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

        <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[0.9375rem]">
          <Stat icon={<QuoteIcon />} label="Citations">
            <Link href={`/search?cites=${shortId(work.id)}`} className="underline underline-offset-2 hover:text-accent-brand">
              {formatCount(work.cited_by_count)}
            </Link>
          </Stat>
          {typeof work.referenced_works_count === "number" && (
            <Stat icon={<BookOpenIcon />} label="Références">{formatCount(work.referenced_works_count)}</Stat>
          )}
          {doiUrl && (
            <Stat label="DOI">
              <ExternalLink href={doiUrl} className="font-mono text-xs underline underline-offset-2 hover:text-accent-brand">
                {/* Texte depuis la valeur brute : u.href encoderait les « < > » des DOI SICI. */}
                {(work.doi ?? doiUrl).replace(/^https?:\/\/doi\.org\//i, "")}
              </ExternalLink>
            </Stat>
          )}
        </dl>

        <div className="mt-5 flex flex-wrap gap-2">
          {oa && oa.isPdf && readable && <ReadPdfButton workId={shortId(work.id)} originalUrl={oa.url} className="px-3.5" />}
          {oa && oa.isPdf && !readable && (
            <ExternalLink href={oa.url} className={buttonVariants({ size: "lg", className: "px-3.5" })}>
              <FileTextIcon /> Lire le PDF
            </ExternalLink>
          )}
          {oa && !oa.isPdf && (
            <ExternalLink href={oa.url} className={buttonVariants({ size: "lg", className: "px-3.5" })}>
              <FileTextIcon /> Lire en accès ouvert
            </ExternalLink>
          )}
          {publisher && (
            <ExternalLink href={publisher} className={buttonVariants({ variant: "outline", size: "lg", className: "bg-card px-3.5" })}>
              {oa ? <ExternalLinkIcon /> : <LockIcon />} {oa ? "Voir chez l'éditeur" : "Éditeur (abonnement)"}
            </ExternalLink>
          )}
          <CopyButton text={toApa(work)} label="Citer (APA)" message="Référence APA copiée." size="lg" className="bg-card px-3.5" />
          <CopyButton text={toBibtex(work)} label="BibTeX" message="Référence BibTeX copiée." size="lg" className="bg-card px-3.5" />
          {isAuthEnabled() && <FavoriteButton snapshot={snapshotFromWork(work)} variant="button" initialActive={initiallyFavorite} className="px-3.5" />}
          {isAuthEnabled() && <CollectionPicker snapshot={snapshotFromWork(work)} variant="button" className="px-3.5" />}
        </div>
        {!oa && (
          <aside className="mt-4 flex flex-col gap-3 rounded-xl border border-dashed p-4 text-[0.9375rem] sm:flex-row sm:items-start sm:justify-between" aria-label="Accès à l'article">
            <div className="flex items-start gap-2.5">
              <LockIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Texte intégral non accessible ici.</span> Aucune version libre n'est connue : la page de l'éditeur demande en général un abonnement, souvent couvert par votre bibliothèque universitaire. Vous pouvez tout de même l'enregistrer, le citer et noter vos citations à la main.
              </p>
            </div>
            <ExternalLink
              href={`https://scholar.google.com/scholar?q=${encodeURIComponent(work.doi ? work.doi.replace(/^https?:\/\/doi\.org\//, "") : workTitle(work))}`}
              className={buttonVariants({ variant: "outline", size: "sm", className: "shrink-0 bg-card" })}
            >
              <SearchIcon /> Chercher une version libre
            </ExternalLink>
          </aside>
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
            <HighlightableAbstract text={abstract} lang={contentLang(work.language)} className="mt-3 text-[1.0625rem] leading-relaxed" />
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

        <ArticleHighlights hasAbstract={Boolean(abstract)} hasPdf={Boolean(oa?.isPdf && readable)} abstract={abstract ?? undefined} lang={contentLang(work.language)} />

        <ArticleNote enabled={Boolean(sessionUser)} snapshot={snapshotFromWork(work)} initial={initialNote} />

        {(work.topics?.length || work.keywords?.length) && (
          <section className="mt-8" aria-labelledby="topics">
            <h2 id="topics" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Sujets</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {work.topics?.slice(0, 3).map((t) => (
                <Link key={t.id} href={`/search?topic=${shortId(t.id)}`}>
                  <Badge variant="secondary" className="h-auto min-h-7 cursor-pointer whitespace-normal px-3 py-1 text-sm">{t.display_name}</Badge>
                </Link>
              ))}
              {work.keywords?.slice(0, 6).map((k) => (
                <Link key={k.id} href={`/search?q=${encodeURIComponent(k.display_name)}`}>
                  <Badge variant="outline" className="h-auto min-h-7 cursor-pointer whitespace-normal px-3 py-1 text-sm">{k.display_name}</Badge>
                </Link>
              ))}
            </div>
          </section>
        )}
      </HighlightsProvider>
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
    <p className="mt-4 text-[0.9375rem] leading-relaxed">
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
  } catch (e) {
    logError("article.similar", e, { work: shortId(work.id) });
    return <p className="mt-4 text-sm text-muted-foreground">Suggestions indisponibles pour le moment.</p>;
  }
  if (similar.length === 0) return <p className="mt-4 text-sm text-muted-foreground">Aucune suggestion pour cet article.</p>;
  return (
    <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
    </div>
  );
}
