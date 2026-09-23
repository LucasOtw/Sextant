import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AccountActions } from "@/components/auth/account-actions";
import { getCurrentUser, isAuthEnabled } from "@/lib/auth";

export const metadata: Metadata = { title: "Mon compte" };

export default async function AccountPage() {
  if (!isAuthEnabled()) redirect("/");
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const initials = (user.name ?? user.email ?? "?").split(/[\s@]+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="max-w-3xl">
        <h1 className="title-display text-4xl sm:text-5xl">Mon compte</h1>
        <div className="mt-8 flex items-center gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
          <Avatar className="size-14">
            {user.picture && <AvatarImage src={user.picture} alt="" referrerPolicy="no-referrer" />}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{user.name ?? "Sans nom"}</p>
            {user.email && <p className="truncate text-muted-foreground">{user.email}</p>}
            <p className="mt-1 text-sm text-muted-foreground">Connecté avec Google</p>
          </div>
        </div>

        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Bientôt</h2>
          <p className="mt-2 text-[15px] text-muted-foreground">
            Favoris, collections et notes synchronisés entre vos appareils arrivent ici. Pour l'instant, votre compte
            existe et ne contient que votre profil Google.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Session et données</h2>
          <p className="mb-4 mt-2 text-[15px] text-muted-foreground">
            La déconnexion ferme la session sur cet appareil. La suppression efface votre compte et toutes ses données.
          </p>
          <AccountActions />
        </section>
      </div>
    </div>
  );
}
