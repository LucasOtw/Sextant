import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listCollections } from "@/lib/collections";
import { listFavorites } from "@/lib/favorites";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { listHighlights } from "@/lib/highlights";
import { listKeys } from "@/lib/api-keys";
import { listNotes } from "@/lib/notes";
import { logError } from "@/lib/log";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Export des données du compte (droits d'accès et de portabilité, RGPD art. 15 et 20) : un fichier JSON lisible,
 * avec tout ce que Sextant conserve pour vous. Téléchargé depuis « Mon compte ».
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  if (!rateLimit(`export:${user.uid}`, 5, 60_000)) return NextResponse.json({ error: "Trop de requêtes, réessayez dans une minute." }, { status: 429 });
  try {
    const db = await adminDb();
    const [profileSnap, favorites, lists, highlights, notes, keys] = await Promise.all([
      db.doc(`users/${user.uid}`).get(),
      listFavorites(user.uid),
      listCollections(user.uid),
      listHighlights(user.uid),
      listNotes(user.uid, 2000),
      listKeys(user.uid),
    ]);
    const created = profileSnap.get("createdAt") as { toDate?: () => Date } | undefined;
    // Repli sur Firebase Auth quand le profil n'a pas de date d'inscription : la donnée exportée reste exacte.
    const createdAt =
      created?.toDate?.().toISOString() ??
      (await (await adminAuth())
        .getUser(user.uid)
        .then((u) => (u.metadata.creationTime ? new Date(u.metadata.creationTime).toISOString() : null))
        .catch((e) => {
          logError("export.getUser", e);
          return null;
        }));
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
      },
      favorites,
      lists,
      citations: highlights,
      notes,
      // Les clés ne sont jamais stockées en clair : seuls leur nom, leur début et leurs dates figurent ici.
      assistantKeys: keys.map(({ name, prefix, createdAt, lastUsedAt }) => ({ name, prefix, createdAt, lastUsedAt })),
    };
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="sextant-mes-donnees-${stamp}.json"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (e) {
    logError("export.GET", e);
    return NextResponse.json({ error: "L'export a échoué, réessayez." }, { status: 502 });
  }
}
