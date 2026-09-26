import type { Metadata } from "next";
import { headers } from "next/headers";
import { FeedbackBoard } from "@/components/feedback/feedback-board";
import { TooManyRequests } from "@/components/too-many-requests";
import { getCurrentUser, isAuthEnabled } from "@/lib/auth";
import { listFeedbackCached, userFeedbackVotes } from "@/lib/feedback";
import type { FeedbackItem } from "@/lib/feedback-shared";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const metadata: Metadata = {
  title: "Bugs et idées",
  description: "Signalez un bug ou proposez une amélioration de Sextant, et votez pour ce qui compte pour vous.",
};

// Rendu à chaque visite (votes de l'utilisateur, limite par IP) ; la liste elle-même vient du cache de 60 s, vidé à
// chaque écriture (PERF-08) : votes et nouveaux sujets restent visibles tout de suite.
export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  // Page publique : limite par IP avant Firestore (par instance), assez large pour un campus derrière un NAT.
  const limited = !rateLimit(`feedback-view:${clientIp(await headers())}`, 120, 60_000);
  let items: FeedbackItem[] = [];
  let voted: string[] = [];
  let loadError = false;
  let user: Awaited<ReturnType<typeof getCurrentUser>> = null;
  if (!limited) {
    // Liste et session en parallèle ; les votes de l'utilisateur (non cachables) dès que la session est connue.
    const userP = isAuthEnabled() ? getCurrentUser() : Promise.resolve(null);
    const [list, votes, sessionUser] = await Promise.allSettled([
      listFeedbackCached(),
      userP.then((u) => (u ? userFeedbackVotes(u.uid) : [])),
      userP,
    ]);
    if (sessionUser.status === "fulfilled") user = sessionUser.value;
    if (list.status === "fulfilled") items = list.value;
    else loadError = true;
    if (votes.status === "fulfilled") voted = votes.value;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="max-w-3xl">
        <h1 className="title-display text-4xl sm:text-5xl">Bugs et idées</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Signalez un problème ou proposez une amélioration. Votez pour ce qui compte pour vous : les sujets les plus demandés passent en premier.
        </p>
        <div className="mt-8">
          {limited ? <TooManyRequests /> : <FeedbackBoard initial={items} initialVoted={voted} signedIn={Boolean(user)} loadError={loadError} />}
        </div>
      </div>
    </div>
  );
}
