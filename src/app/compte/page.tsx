import type { Metadata } from "next";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BookmarkIcon, DownloadIcon, FolderIcon, HistoryIcon, ShieldCheckIcon, HighlighterIcon, NotebookPenIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AccountActions } from "@/components/auth/account-actions";
import { McpKeys } from "@/components/account/mcp-keys";
import { getCurrentUser, isAuthEnabled } from "@/lib/auth";
import { accountCreatedAt, readProfile } from "@/lib/account";
import { logError } from "@/lib/log";
import { countFavorites } from "@/lib/favorites";
import { countCollections } from "@/lib/collections";
import { countHighlights } from "@/lib/highlights";
import { countNotes } from "@/lib/notes";
import { initialsOf } from "@/lib/format";
import { DATE_LONG } from "@/lib/dates";

export const metadata: Metadata = { title: "Mon compte", robots: { index: false } };

/** « Membre depuis le … » : date d'inscription (lib/account, repli sur Firebase Auth) ; illisible : rien d'affiché. */
async function memberSince(uid: string, profile: Promise<DocumentSnapshot>): Promise<string | null> {
  try {
    const d = await accountCreatedAt(uid, await profile);
    return d ? DATE_LONG.format(d) : null;
  } catch (e) {
    logError("compte.memberSince", e);
    return null;
  }
}

/** Un compteur illisible s'affiche « — » (et se journalise) plutôt que « 0 », qui ferait croire la bibliothèque vide. */
function countOrNull(scope: string, p: Promise<number>): Promise<number | null> {
  return p.catch((e) => {
    logError(scope, e);
    return null;
  });
}

export default async function AccountPage() {
  if (!isAuthEnabled()) redirect("/");
  const user = await getCurrentUser();
  if (!user) redirect("/");

  // `users/{uid}` lu une seule fois : il porte à la fois la date d'inscription et le compteur de favoris.
  const userDoc = readProfile(user.uid);
  const [since, favoritesCount, collectionsCount, highlightsCount, notesCount] = await Promise.all([
    memberSince(user.uid, userDoc),
    countOrNull("compte.countFavorites", userDoc.then((snap) => countFavorites(user.uid, snap))),
    countOrNull("compte.countCollections", countCollections(user.uid)),
    countOrNull("compte.countHighlights", countHighlights(user.uid)),
    countOrNull("compte.countNotes", countNotes(user.uid)),
  ]);
  const initials = initialsOf(user);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="max-w-3xl">
        <h1 className="title-display type-h1">Mon compte</h1>

        <section className="mt-8 flex items-center gap-4 rounded-xl bg-card p-5 border border-border">
          <Avatar className="size-16">
            {user.picture && <AvatarImage src={user.picture} alt="" referrerPolicy="no-referrer" />}
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="title-display truncate text-xl">{user.name ?? "Sans nom"}</p>
            {user.email && <p className="truncate text-muted-foreground">{user.email}</p>}
            <p className="mt-1 text-sm text-muted-foreground">
              Connecté avec Google{since && <> · membre depuis le {since}</>}
            </p>
          </div>
        </section>

        <section className="mt-10" aria-labelledby="bibliotheque">
          <h2 id="bibliotheque" className="section-title">Ma bibliothèque</h2>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Tile icon={<BookmarkIcon />} label="Favoris" value={favoritesCount === null ? "—" : String(favoritesCount)} hint="Le cœur sur un article l'enregistre ici." href="/favoris" />
            <Tile icon={<FolderIcon />} label="Listes" value={collectionsCount === null ? "—" : String(collectionsCount)} hint="Classez vos favoris : mémoire, santé, à lire…" href="/favoris" />
            <Tile icon={<HighlighterIcon />} label="Mes citations" value={highlightsCount === null ? "—" : String(highlightsCount)} hint="Passages surlignés, gardés avec leur source." href="/citations" />
            <Tile icon={<NotebookPenIcon />} label="Notes" value={notesCount === null ? "—" : String(notesCount)} hint="Ce que vous retenez d'un article, sur sa fiche." />
            <Tile icon={<HistoryIcon />} label="Consultés" value="—" hint="Aujourd'hui gardé sur cet appareil ; bientôt synchronisé." />
          </ul>
        </section>

        <section className="mt-10" aria-labelledby="assistants">
          <h2 id="assistants" className="section-title">Assistants IA (MCP)</h2>
          <div className="mt-3"><McpKeys /></div>
        </section>

        <section className="mt-10" aria-labelledby="donnees">
          <h2 id="donnees" className="section-title">Données et confidentialité</h2>
          <div className="mt-3 flex flex-col gap-4 rounded-xl bg-card p-5 border border-border">
            <div className="flex items-start gap-3">
              <ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-accent-brand" aria-hidden />
              <p className="max-w-measure-text text-meta leading-relaxed text-muted-foreground">
                Votre compte contient votre nom, votre e-mail et votre photo Google, les dates de création du compte, de dernière
                connexion et de dernier usage d'une clé d'assistant IA, et ce que vous enregistrez dans Sextant : favoris, le dernier
                favori retiré et les dates des favoris retirés récemment (pour «&nbsp;Annuler&nbsp;»), listes et leurs liens de partage, citations, notes, clés d'assistants IA, vos sujets et
                vos votes sur «&nbsp;Bugs et idées&nbsp;». Aucun suivi. Détails dans la{" "}
                <Link href="/confidentialite" className="underline underline-offset-2 hover:text-foreground">politique de confidentialité</Link>.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 pl-8">
              <a href="/api/account/export" download className={buttonVariants({ variant: "outline", className: "bg-card" })}>
                <DownloadIcon /> Télécharger mes données
              </a>
              <span className="text-sm text-muted-foreground">Un fichier JSON avec tout ce que Sextant conserve pour vous.</span>
            </div>
          </div>
        </section>

        <section className="mt-10" aria-labelledby="session">
          <h2 id="session" className="section-title">Session et compte</h2>
          <p className="mb-4 mt-2 max-w-measure-text text-meta text-muted-foreground">
            La déconnexion ferme la session sur cet appareil. «&nbsp;Se déconnecter de tous les appareils&nbsp;» ferme aussi les autres sessions
            et révoque vos clés d'assistant IA. La suppression efface immédiatement votre compte et toutes ses données.
          </p>
          <AccountActions />
        </section>
      </div>
    </div>
  );
}

function Tile({ icon, label, value, hint, href }: { icon: React.ReactNode; label: string; value: string; hint: string; href?: string }) {
  const body = (
    <>
      <span className="flex items-center gap-2 text-sm text-muted-foreground [&_svg]:size-4">{icon}{label}</span>
      <span className="title-display text-3xl tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </>
  );
  return (
    <li className="rounded-xl bg-card border border-border">
      {href ? (
        <Link href={href} className="flex h-full flex-col gap-1 rounded-xl p-4 transition-colors hover:bg-muted/60">{body}</Link>
      ) : (
        <div className="flex h-full flex-col gap-1 p-4">{body}</div>
      )}
    </li>
  );
}
