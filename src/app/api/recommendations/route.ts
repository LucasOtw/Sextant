import { NextResponse } from "next/server";
import { getQualityWorksByIds, getRecentByTopic, getSeedMeta, shortId, type Work } from "@/lib/openalex";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import type { Recommendation, RecommendationSeed } from "@/lib/recommendations-shared";

export const runtime = "nodejs";

const RESULTS = 6;
const MAX_TOPICS = 3;
const MAX_SEEDS = 20;

/** OpenAlex refuse tout le lot si un identifiant est hors format (« W1 ») : on ne garde que des identifiants plausibles. */
const PLAUSIBLE_ID = /^W\d{2,15}$/;

function ids(param: string | null, max: number): string[] {
  const out: string[] = [];
  for (const raw of (param ?? "").split(",")) {
    const id = raw.trim();
    if (PLAUSIBLE_ID.test(id) && !out.includes(id)) out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * « Pour vous », sans stockage : le navigateur envoie ce qu'il sait (favoris et consultations, du plus récent au plus ancien,
 * et les suggestions écartées). Chaque article pèse selon sa nature et sa récence : un favori compte trois fois une consultation.
 * Deux sources, en alternance :
 *  - les articles apparentés (related_works d'OpenAlex) qui reviennent chez plusieurs de vos articles ;
 *  - les articles récents et cités des sujets qui pèsent le plus dans vos lectures.
 * La réponse ne dépend que de la requête : elle se met en cache comme n'importe quelle page publique.
 */
export async function GET(req: Request) {
  if (!rateLimit(`reco:${clientIp(req)}`, 30, 60_000)) return NextResponse.json({ error: "Trop de requêtes." }, { status: 429 });
  const params = new URL(req.url).searchParams;
  const seen = ids(params.get("seen"), 12);
  const fav = ids(params.get("fav"), 30);
  const hide = ids(params.get("hide"), 200);
  const cache = { "cache-control": "public, max-age=300, s-maxage=3600" };
  if (seen.length === 0 && fav.length === 0) return NextResponse.json({ items: [] }, { headers: cache });

  // Poids des graines : favori 3, consultation 1, décroissants avec l'ancienneté ; un article à la fois favori et consulté cumule.
  const weight = new Map<string, number>();
  fav.forEach((id, i) => weight.set(id, (weight.get(id) ?? 0) + 3 / (1 + 0.15 * i)));
  seen.forEach((id, i) => weight.set(id, (weight.get(id) ?? 0) + 1 / (1 + 0.3 * i)));
  const seedIds = [...weight.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_SEEDS).map(([id]) => id);

  try {
    const seeds = await getSeedMeta(seedIds);
    const title = (w: (typeof seeds)[number]) => (w.display_name ?? w.title ?? "").trim() || "un article";

    // Sujets et apparentés, pondérés par les graines qui y mènent.
    const topics = new Map<string, { name: string; score: number; seeds: RecommendationSeed[] }>();
    const related = new Map<string, { score: number; seeds: RecommendationSeed[] }>();
    for (const w of seeds) {
      const id = shortId(w.id);
      const wgt = weight.get(id) ?? 0;
      const seed = { id, title: title(w) };
      if (w.primary_topic) {
        const t = topics.get(w.primary_topic.id) ?? { name: w.primary_topic.display_name, score: 0, seeds: [] };
        t.score += wgt;
        if (t.seeds.length < 2) t.seeds.push(seed);
        topics.set(w.primary_topic.id, t);
      }
      for (const r of w.related_works ?? []) {
        const rid = shortId(r);
        const cur = related.get(rid) ?? { score: 0, seeds: [] };
        cur.score += wgt;
        if (cur.seeds.length < 2 && !cur.seeds.some((s) => s.id === id)) cur.seeds.push(seed);
        related.set(rid, cur);
      }
    }

    const exclude = new Set([...seen, ...fav, ...hide]);
    // Apparentés : ceux qui reviennent chez plusieurs de vos articles d'abord, puis le poids de leurs graines.
    const relatedRanked = [...related.entries()]
      .filter(([rid]) => !exclude.has(rid))
      .sort((a, b) => b[1].seeds.length - a[1].seeds.length || b[1].score - a[1].score)
      .slice(0, 18);
    const topTopics = [...topics.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, MAX_TOPICS);
    const since = new Date().getFullYear() - 4;

    const [relatedWorks, perTopic] = await Promise.all([
      getQualityWorksByIds(relatedRanked.map(([rid]) => rid)).catch(() => [] as Work[]),
      Promise.all(topTopics.map(([tid]) => getRecentByTopic(tid, since, RESULTS).catch(() => [] as Work[]))),
    ]);

    const relatedQueue: Recommendation[] = relatedWorks.map((w) => ({ work: w, reason: { kind: "related", seeds: related.get(shortId(w.id))?.seeds ?? [] } }));
    const topicQueue: Recommendation[] = [];
    for (let i = 0; i < RESULTS; i++) {
      topTopics.forEach(([, t], k) => {
        const w = perTopic[k][i];
        if (w) topicQueue.push({ work: w, reason: { kind: "topic", topic: t.name, seeds: t.seeds.slice(0, 1) } });
      });
    }

    // Alternance apparenté / sujet, sans doublon ni déjà-vu.
    const out: Recommendation[] = [];
    const used = new Set<string>();
    const take = (q: Recommendation[]) => {
      while (q.length) {
        const r = q.shift()!;
        const id = shortId(r.work.id);
        if (exclude.has(id) || used.has(id)) continue;
        used.add(id);
        out.push(r);
        return true;
      }
      return false;
    };
    while (out.length < RESULTS && (relatedQueue.length || topicQueue.length)) {
      take(relatedQueue);
      if (out.length < RESULTS) take(topicQueue);
    }
    return NextResponse.json({ items: out }, { headers: cache });
  } catch {
    return NextResponse.json({ error: "Recommandations indisponibles." }, { status: 502 });
  }
}
