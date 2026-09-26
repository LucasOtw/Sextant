import { NextResponse } from "next/server";
import { requireStrictUser } from "@/lib/auth";
import { overLimit, PRIVATE, serverError, tooMany } from "@/lib/api/guard";
import { listCollections } from "@/lib/collections";
import { listFavorites } from "@/lib/favorites";
import { accountCreatedAt, readProfile } from "@/lib/account";
import { isoFromTimestamp as iso } from "@/lib/firebase/decode";
import { listHighlights } from "@/lib/highlights";
import { listKeysForExport } from "@/lib/api-keys";
import { listFeedbackByAuthor, listFeedbackVotesForExport } from "@/lib/feedback";
import { listAllNotes } from "@/lib/notes";
import { listSharesForExport } from "@/lib/shares";

export const runtime = "nodejs";

/**
 * Export des données du compte (droits d'accès et de portabilité, RGPD art. 15 et 20) : un fichier JSON lisible,
 * avec tout ce que Sextant conserve pour vous (NEW-2). Téléchargé depuis « Mon compte ». Les données rattachées au
 * compte hors de `users/{uid}` y figurent aussi : sujets publiés sur « Bugs et idées », liens de partage, clés
 * d'assistant IA (sans leur empreinte). Les condensés IA ne dépendent que de l'article : ils ne sont pas rattachés au
 * compte. Aucune session ni historique de consultation n'est stocké côté serveur.
 */
export async function GET() {
  const { ok, user, refused: denied } = await requireStrictUser();
  if (!ok) return denied;
  if (overLimit("export", user.uid)) return tooMany();
  try {
    const [profileSnap, favorites, lists, highlights, notes, keys, published, votes, shares] = await Promise.all([
      readProfile(user.uid),
      listFavorites(user.uid),
      listCollections(user.uid),
      listHighlights(user.uid),
      // Toutes les notes, par pages : l'export ne se tronque pas en silence (SEC-19).
      listAllNotes(user.uid),
      listKeysForExport(user.uid),
      listFeedbackByAuthor(user.uid),
      listFeedbackVotesForExport(user.uid),
      listSharesForExport(user.uid),
    ]);
    // Repli sur Firebase Auth quand le profil n'a pas de date d'inscription : la donnée exportée reste exacte.
    const createdAt = (await accountCreatedAt(user.uid, profileSnap))?.toISOString() ?? null;
    // Dernier favori retiré, gardé pour « Annuler » (lib/favorites.ts) : remplacé au retrait suivant.
    const removed = profileSnap.get("lastRemovedFavorite") as { snapshot?: unknown; at?: unknown } | undefined;
    const data = {
      format: "Sextant — export des données du compte",
      exportedAt: new Date().toISOString(),
      profile: {
        uid: user.uid,
        name: user.name,
        email: user.email,
        picture: user.picture,
        provider: "Google (Firebase Authentication)",
        createdAt,
        lastLoginAt: iso(profileSnap.get("lastLoginAt")),
        // Dernier usage d'une clé d'assistant IA, gardé dans le profil pour la purge des comptes inactifs (NEW-14).
        lastKeyUsedAt: iso(profileSnap.get("lastKeyUsedAt")),
      },
      favorites,
      lastRemovedFavorite: removed?.snapshot ? { article: removed.snapshot, removedAt: iso(removed.at) } : null,
      lists,
      sharedLinks: shares,
      citations: highlights,
      notes,
      // Les clés ne sont jamais stockées en clair, et leur empreinte n'est pas exportée : nom, début et dates seulement.
      assistantKeys: keys,
      // « Bugs et idées » : sujets publiés depuis ce compte (publics, sans nom d'auteur) et votes (anonymes pour les autres).
      feedback: { published, votes },
    };
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="sextant-mes-donnees-${stamp}.json"`,
        ...PRIVATE,
      },
    });
  } catch (e) {
    return serverError("export.GET", e, "L'export a échoué, réessayez.");
  }
}
