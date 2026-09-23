import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FavoritesList } from "@/components/favorites/favorites-list";
import { SignInPrompt } from "@/components/favorites/sign-in-prompt";
import { getCurrentUser, isAuthEnabled } from "@/lib/auth";
import { listFavorites } from "@/lib/favorites";
import type { Favorite } from "@/lib/favorites-shared";

export const metadata: Metadata = { title: "Mes favoris" };

interface Props {
  searchParams: Promise<{ liste?: string | string[] }>;
}

export default async function FavoritesPage({ searchParams }: Props) {
  if (!isAuthEnabled()) redirect("/");
  const { liste } = await searchParams;
  const initialCollectionId = typeof liste === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(liste) ? liste : null;
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
          Les articles que vous avez enregistrés, sur tous vos appareils. Classez-les en listes, exportez-les en BibTeX.
        </p>
        <div className="mt-8">{user ? <FavoritesList initial={favorites} loadError={loadError} initialCollectionId={initialCollectionId} /> : <SignInPrompt />}</div>
      </div>
    </div>
  );
}
