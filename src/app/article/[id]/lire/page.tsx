import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";
import { HighlightsProvider } from "@/components/highlights/highlights-provider";
import { SourceUnavailable } from "@/components/source-unavailable";
import { ReaderLayout } from "@/components/highlights/pdf-reader";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser, isAuthEnabled } from "@/lib/auth";
import { snapshotFromWork } from "@/lib/favorites-shared";
import { openAccessPdfUrls, openAccessUrl, workTitle } from "@/lib/format";
import { listHighlights } from "@/lib/highlights";
import { getWork, OpenAlexError, shortId, type Work } from "@/lib/openalex";
import { logError, recover } from "@/lib/log";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!/^W\d+$/i.test(id)) return { title: "Article introuvable", robots: { index: false } };
  const work = await getWork(id).catch(() => null);
  return { title: work ? `Lire · ${workTitle(work)}` : "Lecteur", robots: { index: false } };
}

/** Lecteur PDF intégré : uniquement pour une version en accès ouvert connue d'OpenAlex ; sinon retour à la fiche. */
export default async function ReaderPage({ params }: Props) {
  const { id } = await params;
  if (!/^W\d+$/i.test(id)) notFound();
  let work: Work | null;
  try {
    work = await getWork(id);
  } catch (e) {
    if (!(e instanceof OpenAlexError)) throw e;
    logError("reader.getWork", e, { work: id });
    return <SourceUnavailable rateLimited={e.isRateLimited} retryHref={`/article/${id}/lire`} />;
  }
  if (!work) notFound();
  const wid = shortId(work.id);
  const oa = openAccessUrl(work);
  if (!oa?.isPdf || openAccessPdfUrls(work).length === 0) redirect(`/article/${wid}`);

  const sessionUser = isAuthEnabled() ? await getCurrentUser() : null;
  const initial = sessionUser ? await listHighlights(sessionUser.uid, wid).catch(recover("reader.highlights", [])) : [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/article/${wid}`} className={buttonVariants({ variant: "outline", size: "sm", className: "bg-card" })}>
          <ArrowLeftIcon /> Fiche article
        </Link>
        {/* Sur mobile, le titre passe en entier sous les deux boutons au lieu d'être haché dans une colonne étroite. */}
        <h1 className="title-display order-last basis-full wrap-break-word text-xl sm:order-none sm:min-w-0 sm:flex-1 sm:basis-0">{workTitle(work)}</h1>
        <a href={oa.url} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ExternalLinkIcon /> PDF original
        </a>
      </div>
      <HighlightsProvider key={sessionUser?.uid ?? "anon"} enabled={Boolean(sessionUser)} snapshot={snapshotFromWork(work)} initial={initial}>
        <ReaderLayout url={`/api/pdf?work=${wid}`} originalUrl={oa.url} />
      </HighlightsProvider>
    </div>
  );
}
