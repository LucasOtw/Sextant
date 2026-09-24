import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FavoritesList } from "@/components/favorites/favorites-list";
import { SignInPrompt } from "@/components/favorites/sign-in-prompt";
import { TooManyRequests } from "@/components/too-many-requests";
import { getCurrentUser, isAuthEnabled } from "@/lib/auth";
import { listCollections } from "@/lib/collections";
import type { Collection } from "@/lib/collections-shared";
import { rateLimit } from "@/lib/rate-limit";
import { listFavorites } from "@/lib/favorites";
import { logError, recover } from "@/lib/log";
import { getRetractedIds } from "@/lib/openalex";
import type { Favorite } from "@/lib/favorites-shared";

export const metadata: Metadata = { title: "Mes favoris" };

/** La liste sélectionnée (`?liste=id`) est lue côté client depuis l'URL ; le serveur fournit favoris et listes pour un premier rendu complet. */
export default async function FavoritesPage() {
  if (!isAuthEnabled()) redirect("/");
  const user = await getCurrentUser();

  let favorites: Favorite[] = [];
  let collections: Collection[] = [];
  let loadError = false;
  let retracted: string[] = [];
  // Jusqu'à un millier de lectures par rendu pour une bibliothèque pleine : limite par compte (par instance).
  const limited = user ? !rateLimit(`page-lib:${user.uid}`, 30, 60_000) : false;
  if (user && !limited) {
    const [f, c] = await Promise.allSettled([listFavorites(user.uid), listCollections(user.uid)]);
    if (f.status === "fulfilled") favorites = f.value;
    else {
      loadError = true;
      logError("favoris.list", f.reason);
    }
    if (c.status === "fulfilled") collections = c.value;
    else logError("favoris.collections", c.reason);
    // Rétractations recalculées à chaque visite : un article peut l'être après son enregistrement.
    if (favorites.length > 0) retracted = [...(await getRetractedIds(favorites.map((x) => x.id)).catch(recover("favoris.retracted", new Set<string>())))];
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="max-w-4xl">
        <h1 className="title-display text-4xl sm:text-5xl">Mes favoris</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Les articles que vous avez enregistrés, sur tous vos appareils. Classez-les en listes, exportez-les en BibTeX.
        </p>
        <div className="mt-8">{user ? (limited ? <TooManyRequests /> : <FavoritesList initial={favorites} initialCollections={collections} loadError={loadError} retracted={retracted} />) : <SignInPrompt />}</div>
      </div>
    </div>
  );
}
