import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FavoritesList } from "@/components/favorites/favorites-list";
import { SignInPrompt } from "@/components/favorites/sign-in-prompt";
import { getCurrentUser, isAuthEnabled } from "@/lib/auth";
import { listFavorites } from "@/lib/favorites";
import type { Favorite } from "@/lib/favorites-shared";

export const metadata: Metadata = { title: "Mes favoris" };

export default async function FavoritesPage() {
  if (!isAuthEnabled()) redirect("/");
  const user = await getCurrentUser();

  let favorites: Favorite[] = [];
  let loadError = false;
  if (user) {
    try {
      favorites = await listFavorites(user.uid);
    } catch {
      loadError = true;
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="max-w-4xl">
        <h1 className="title-display text-4xl sm:text-5xl">Mes favoris</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Les articles que vous avez enregistrés, sur tous vos appareils. Exportez-les en BibTeX pour votre gestionnaire de références.
        </p>
        <div className="mt-8">{user ? <FavoritesList initial={favorites} loadError={loadError} /> : <SignInPrompt />}</div>
      </div>
    </div>
  );
}
