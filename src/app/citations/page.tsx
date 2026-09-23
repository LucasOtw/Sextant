import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInPrompt } from "@/components/favorites/sign-in-prompt";
import { CitationsList } from "@/components/highlights/citations-list";
import { getCurrentUser, isAuthEnabled } from "@/lib/auth";
import { listCollections } from "@/lib/collections";
import type { Collection } from "@/lib/collections-shared";
import { listHighlights } from "@/lib/highlights";
import type { Highlight } from "@/lib/highlights-shared";

export const metadata: Metadata = { title: "Mes citations" };

export default async function CitationsPage() {
  if (!isAuthEnabled()) redirect("/");
  const user = await getCurrentUser();

  let highlights: Highlight[] = [];
  let collections: Collection[] = [];
  let loadError = false;
  if (user) {
    const [h, c] = await Promise.allSettled([listHighlights(user.uid), listCollections(user.uid)]);
    if (h.status === "fulfilled") highlights = h.value;
    else loadError = true;
    if (c.status === "fulfilled") collections = c.value;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="max-w-4xl">
        <h1 className="title-display text-4xl sm:text-5xl">Mes citations</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Tout ce que vous avez surligné, avec l'article d'origine et la page. Copiez un passage avec sa référence, prêt à coller.
        </p>
        <div className="mt-8">{user ? <CitationsList initial={highlights} collections={collections} loadError={loadError} /> : <SignInPrompt />}</div>
      </div>
    </div>
  );
}
