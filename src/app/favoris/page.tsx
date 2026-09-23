import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FavoritesList } from "@/components/favorites/favorites-list";
import { getCurrentUser, isAuthEnabled } from "@/lib/auth";
import { listFavorites } from "@/lib/favorites";

export const metadata: Metadata = { title: "Mes favoris" };

export default async function FavoritesPage() {
  if (!isAuthEnabled()) redirect("/");
  const user = await getCurrentUser();
  if (!user) redirect("/?connexion=favoris");
  const favorites = await listFavorites(user.uid).catch(() => []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="max-w-4xl">
        <h1 className="title-display text-4xl sm:text-5xl">Mes favoris</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Les articles que vous avez enregistrés, sur tous vos appareils. Exportez-les en BibTeX pour votre gestionnaire de références.
        </p>
        <div className="mt-8">
          <FavoritesList initial={favorites} />
        </div>
      </div>
    </div>
  );
}
