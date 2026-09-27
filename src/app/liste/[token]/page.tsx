import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { FolderIcon } from "lucide-react";
import { FavoriteButton } from "@/components/favorites/favorite-button";
import { BibtexActions } from "@/components/bibtex-actions";
import { ArticleBadges, ArticleMeta, ArticleTitle, CitationCount } from "@/components/article-card";
import { TooManyRequests } from "@/components/too-many-requests";
import { SHARE_TOKEN } from "@/lib/collections-shared";
import { fileSlug } from "@/lib/favorites-shared";
import { isAdminConfigured } from "@/lib/firebase/admin";
import { overLimit } from "@/lib/api/guard";
import { clientIp } from "@/lib/rate-limit";
import { reportHref } from "@/lib/report";
import { retractedWithin } from "@/lib/retracted";
import { getSharedList, type SharedList } from "@/lib/shares";
import { SITE } from "@/lib/site";

// Lu à chaque visite : un lien désactivé cesse de fonctionner tout de suite.
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ token: string }>;
}

/**
 * Une seule lecture par rendu (métadonnées et page partagent le résultat grâce à `cache`), et une limite par IP
 * avant tout accès à Firestore : une liste pleine coûte un millier de lectures (limite par instance).
 * 120 vues/min : une classe derrière le NAT d'un campus partage la même IP ; la borne globale est au pare-feu Vercel.
 */
const load = cache(async (token: string): Promise<SharedList | "limited" | "unavailable" | null> => {
  if (!SHARE_TOKEN.test(token)) return null;
  // Base non configurée : en local, `npm run dev` sans émulateur ni ALLOW_PROD_DB=1 (garde-fou NEW-4).
  if (!isAdminConfigured()) return "unavailable";
  if (overLimit("share-view", clientIp(await headers()))) return "limited";
  // Pas de catch : getSharedList renvoie déjà null pour un lien inconnu ou désactivé. Une panne Firestore remonte
  // jusqu'à la page d'erreur (journalisée par Next) au lieu de passer pour un lien « introuvable ».
  return getSharedList(token);
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const list = await load((await params).token);
  if (list === "limited") return { title: "Trop de requêtes", robots: { index: false, follow: false } };
  if (list === "unavailable") return { title: "Liste indisponible", robots: { index: false, follow: false } };
  return {
    title: list ? `Liste partagée · ${list.name}` : "Liste introuvable",
    description: list?.description || undefined,
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

/** Page publique d'une liste partagée : nom, description, articles, export BibTeX. Rien d'autre du compte. */
export default async function SharedListPage({ params }: Props) {
  const { token } = await params;
  const list = await load(token);
  if (list === "limited") {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <h1 className="sr-only">Liste partagée</h1>
        <TooManyRequests />
      </div>
    );
  }
  if (list === "unavailable") {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <h1 className="title-display type-h2">Liste indisponible</h1>
        <p className="mt-3 text-meta text-muted-foreground">
          Les listes partagées ne sont pas disponibles sur cette instance. En local, lancez <code>npm run dev:emu</code> ou
          définissez <code>ALLOW_PROD_DB=1</code>.
        </p>
      </div>
    );
  }
  if (!list) notFound();
  const n = list.articles.length;
  // Rétractations recalculées à chaque visite (les instantanés datent de l'enregistrement), bornées dans le temps.
  const retracted = await retractedWithin(list.articles.map((a) => a.id), "liste.retracted");

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="max-w-4xl">
        <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <FolderIcon className="size-4 text-accent-brand" aria-hidden /> Liste partagée
        </p>
        <h1 className="title-display type-h1 mt-2">{list.name}</h1>
        {list.description && <p className="lead mt-3">{list.description}</p>}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-meta text-muted-foreground">{n} article{n > 1 ? "s" : ""}</p>
          <BibtexActions articles={list.articles} filename={`sextant-${fileSlug(list.name)}.bib`} retracted={[...retracted]} />
        </div>

        {n === 0 ? (
          <div className="surface-tint mt-6 rounded-2xl p-10 text-center text-muted-foreground">Cette liste est vide pour le moment.</div>
        ) : (
          <ul className="mt-6 flex flex-col gap-3">
            {list.articles.map((a) => (
              <li key={a.id}>
                <article className="surface-card card-link relative flex flex-col gap-2 p-4 pr-16 sm:p-5 sm:pr-16">
                  <ArticleBadges type={a.type} isOa={a.isOa} retracted={retracted.has(a.id)} topic={a.topic} />
                  <ArticleTitle href={`/article/${a.id}`} as="h2" className="text-xl leading-snug">{a.title}</ArticleTitle>
                  {/* Le cœur suit le titre dans le DOM, en haut à droite à l'écran (A11Y-23). */}
                  <div className="absolute right-3 top-3 z-10">
                    <FavoriteButton snapshot={a} />
                  </div>
                  <ArticleMeta authors={a.authors} venue={a.venue} year={a.year} />
                  <p className="flex items-center gap-1 pt-1 text-sm text-muted-foreground">
                    <CitationCount count={a.citedByCount} />
                  </p>
                </article>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-10 text-sm text-muted-foreground">
          Liste partagée avec <Link href="/" className="link">Sextant</Link>, un moteur de recherche
          d'articles scientifiques évalués par les pairs. Le cœur enregistre un article dans vos propres favoris.
        </p>
        {/* Contenu publié par un utilisateur : signalement à portée de main (DSA art. 16, SEC-13). */}
        <p className="mt-2 text-sm text-muted-foreground">
          Cette liste contient un contenu illicite ?{" "}
          <a href={reportHref(SITE.contactEmail, "liste partagée", `${SITE.url}/liste/${token}`)} className="link-quiet">
            Signaler cette liste
          </a>
        </p>
      </div>
    </div>
  );
}
