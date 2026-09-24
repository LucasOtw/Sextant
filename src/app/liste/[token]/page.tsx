import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { FolderIcon, LockOpenIcon, QuoteIcon } from "lucide-react";
import { FavoriteButton } from "@/components/favorites/favorite-button";
import { SharedListActions } from "@/components/shared/shared-list-actions";
import { TooManyRequests } from "@/components/too-many-requests";
import { Badge } from "@/components/ui/badge";
import { SHARE_TOKEN } from "@/lib/collections-shared";
import { formatCount, typeLabel } from "@/lib/format";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { recover } from "@/lib/log";
import { getRetractedIds } from "@/lib/openalex";
import { getSharedList, type SharedList } from "@/lib/shares";

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
const load = cache(async (token: string): Promise<SharedList | "limited" | null> => {
  if (!SHARE_TOKEN.test(token)) return null;
  if (!rateLimit(`share-view:${clientIp(await headers())}`, 120, 60_000)) return "limited";
  // Pas de catch : getSharedList renvoie déjà null pour un lien inconnu ou désactivé. Une panne Firestore remonte
  // jusqu'à la page d'erreur (journalisée par Next) au lieu de passer pour un lien « introuvable ».
  return getSharedList(token);
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const list = await load((await params).token);
  if (list === "limited") return { title: "Trop de requêtes", robots: { index: false, follow: false } };
  return {
    title: list ? `Liste partagée · ${list.name}` : "Liste introuvable",
    description: list?.description || undefined,
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

/** Page publique d'une liste partagée : nom, description, articles, export BibTeX. Rien d'autre du compte. */
export default async function SharedListPage({ params }: Props) {
  const list = await load((await params).token);
  if (list === "limited") {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <h1 className="sr-only">Liste partagée</h1>
        <TooManyRequests />
      </div>
    );
  }
  if (!list) notFound();
  const n = list.articles.length;
  // Rétractations recalculées à chaque visite : les instantanés de la liste datent de l'enregistrement.
  const retracted = n > 0 ? await getRetractedIds(list.articles.map((a) => a.id)).catch(recover("liste.retracted", new Set<string>())) : new Set<string>();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="max-w-4xl">
        <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          <FolderIcon className="size-4 text-accent-brand" aria-hidden /> Liste partagée
        </p>
        <h1 className="title-display mt-2 text-4xl sm:text-5xl">{list.name}</h1>
        {list.description && <p className="mt-3 text-lg text-muted-foreground">{list.description}</p>}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[15px] text-muted-foreground">{n} article{n > 1 ? "s" : ""}</p>
          <SharedListActions name={list.name} articles={list.articles} retracted={[...retracted]} />
        </div>

        {n === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed p-10 text-center text-muted-foreground">Cette liste est vide pour le moment.</div>
        ) : (
          <ul className="mt-6 flex flex-col gap-3">
            {list.articles.map((a) => (
              <li key={a.id}>
                <article className="relative flex flex-col gap-2 rounded-xl bg-card p-4 pr-16 ring-1 ring-foreground/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-foreground/25 sm:p-5 sm:pr-16">
                  <div className="absolute right-3 top-3 z-10">
                    <FavoriteButton snapshot={a} />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                    <Badge variant="secondary">{typeLabel(a.type)}</Badge>
                    {a.isOa && <Badge className="bg-oa text-oa-foreground"><LockOpenIcon aria-hidden /> Accès ouvert</Badge>}
                    {retracted.has(a.id) && <Badge variant="destructive">Rétracté</Badge>}
                    {a.topic && <span className="truncate">· {a.topic}</span>}
                  </div>
                  <h2 className="title-display text-xl leading-snug">
                    <Link href={`/article/${a.id}`} className="after:absolute after:inset-0 hover:text-accent-brand">{a.title}</Link>
                  </h2>
                  <p className="text-[15px] text-muted-foreground">
                    {a.authors}{a.venue && <> · <span className="italic">{a.venue}</span></>}{a.year && <> · {a.year}</>}
                  </p>
                  <p className="flex items-center gap-1 pt-1 text-sm text-muted-foreground">
                    <QuoteIcon className="size-4 text-accent-brand" aria-hidden />{formatCount(a.citedByCount)} citation{a.citedByCount > 1 ? "s" : ""}
                  </p>
                </article>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-10 text-sm text-muted-foreground">
          Liste partagée avec <Link href="/" className="text-accent-brand underline underline-offset-3">Sextant</Link>, un moteur de recherche
          d'articles scientifiques évalués par les pairs. Le cœur enregistre un article dans vos propres favoris.
        </p>
      </div>
    </div>
  );
}
