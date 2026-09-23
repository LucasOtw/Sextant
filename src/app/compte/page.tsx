import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BookmarkIcon, FolderIcon, HistoryIcon, ShieldCheckIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AccountActions } from "@/components/auth/account-actions";
import { getCurrentUser, isAuthEnabled } from "@/lib/auth";
import { adminDb } from "@/lib/firebase/admin";
import { countFavorites } from "@/lib/favorites";
import { countCollections } from "@/lib/collections";

export const metadata: Metadata = { title: "Mon compte" };

async function memberSince(uid: string): Promise<string | null> {
  try {
    const snap = await (await adminDb()).doc(`users/${uid}`).get();
    const ts = snap.get("createdAt") as { toDate?: () => Date } | undefined;
    const d = ts?.toDate?.();
    return d ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(d) : null;
  } catch {
    return null;
  }
}

export default async function AccountPage() {
  if (!isAuthEnabled()) redirect("/");
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const [since, favoritesCount, collectionsCount] = await Promise.all([
    memberSince(user.uid),
    countFavorites(user.uid).catch(() => 0),
    countCollections(user.uid).catch(() => 0),
  ]);
  const initials = (user.name ?? user.email ?? "?").split(/[\s@]+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="max-w-3xl">
        <h1 className="title-display text-4xl sm:text-5xl">Mon compte</h1>

        <section className="mt-8 flex items-center gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
          <Avatar className="size-16">
            {user.picture && <AvatarImage src={user.picture} alt="" referrerPolicy="no-referrer" />}
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-xl font-semibold">{user.name ?? "Sans nom"}</p>
            {user.email && <p className="truncate text-muted-foreground">{user.email}</p>}
            <p className="mt-1 text-sm text-muted-foreground">
              Connecté avec Google{since && <> · membre depuis le {since}</>}
            </p>
          </div>
        </section>

        <section className="mt-10" aria-labelledby="bibliotheque">
          <h2 id="bibliotheque" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Ma bibliothèque</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-3">
            <Tile icon={<BookmarkIcon />} label="Favoris" value={String(favoritesCount)} hint="Le cœur sur un article l'enregistre ici." href="/favoris" />
            <Tile icon={<FolderIcon />} label="Listes" value={String(collectionsCount)} hint="Classez vos favoris : mémoire, santé, à lire…" href="/favoris" />
            <Tile icon={<HistoryIcon />} label="Consultés" value="—" hint="Aujourd'hui gardé sur cet appareil ; bientôt synchronisé." />
          </ul>
        </section>

        <section className="mt-10" aria-labelledby="donnees">
          <h2 id="donnees" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Données et confidentialité</h2>
          <div className="mt-3 flex items-start gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
            <ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-accent-brand" aria-hidden />
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              Votre compte contient votre nom, votre e-mail et votre photo Google, ainsi que ce que vous enregistrerez dans
              Sextant. Rien d'autre, aucun suivi. Détails dans la{" "}
              <Link href="/confidentialite" className="underline underline-offset-2 hover:text-foreground">politique de confidentialité</Link>.
            </p>
          </div>
        </section>

        <section className="mt-10" aria-labelledby="session">
          <h2 id="session" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Session et compte</h2>
          <p className="mb-4 mt-2 text-[15px] text-muted-foreground">
            La déconnexion ferme la session sur cet appareil. La suppression efface immédiatement votre compte et toutes ses données.
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
      <span className="text-3xl font-semibold tracking-tight">{value}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </>
  );
  return (
    <li className="rounded-xl bg-card ring-1 ring-foreground/10">
      {href ? (
        <Link href={href} className="flex h-full flex-col gap-1 rounded-xl p-4 transition-colors hover:bg-muted/60">{body}</Link>
      ) : (
        <div className="flex h-full flex-col gap-1 p-4">{body}</div>
      )}
    </li>
  );
}
