import { shortId, type Work } from "@/lib/openalex";
import type { Recommendation, RecommendationSeed } from "@/lib/recommendations-shared";

/**
 * Classement de « Pour vous », sans entrée-sortie : extrait de `app/api/recommendations/route.ts` pour être testé seul.
 * Le handler lit la requête, appelle OpenAlex et ne fait qu'enchaîner ces étapes.
 */

/** OpenAlex refuse tout le lot si un identifiant est hors format (« W1 ») : on ne garde que des identifiants plausibles. */
const PLAUSIBLE_ID = /^W\d{2,15}$/;

/** Liste d'identifiants d'un paramètre d'URL (« W1,W2 ») : plausibles, sans doublon, bornée. */
export function parseIds(param: string | null, max: number): string[] {
  const out: string[] = [];
  for (const raw of (param ?? "").split(",")) {
    const id = raw.trim();
    if (PLAUSIBLE_ID.test(id) && !out.includes(id)) out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Poids des graines : favori 3, consultation 1, décroissants avec l'ancienneté (listes du plus récent au plus ancien) ;
 * un article à la fois favori et consulté cumule.
 */
export function seedWeights(fav: string[], seen: string[]): Map<string, number> {
  const weight = new Map<string, number>();
  fav.forEach((id, i) => weight.set(id, (weight.get(id) ?? 0) + 3 / (1 + 0.15 * i)));
  seen.forEach((id, i) => weight.set(id, (weight.get(id) ?? 0) + 1 / (1 + 0.3 * i)));
  return weight;
}

/** Les graines les plus lourdes d'abord, bornées. */
export function topSeedIds(weight: Map<string, number>, max: number): string[] {
  return [...weight.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([id]) => id);
}

export type SeedMeta = Pick<Work, "id" | "display_name" | "title" | "primary_topic" | "related_works">;

export interface RecommendationPlan {
  /** Apparentés à demander à OpenAlex, du mieux classé au moins bien classé. */
  relatedIds: string[];
  /** Graines (deux au plus) qui mènent à chaque apparenté : c'est le « pourquoi » affiché. */
  relatedSeeds: Map<string, RecommendationSeed[]>;
  /** Sujets qui pèsent le plus dans les lectures, du plus lourd au plus léger. */
  topics: { id: string; name: string; seeds: RecommendationSeed[] }[];
}

/**
 * Sujets et apparentés, pondérés par les graines qui y mènent. Apparentés : ceux qui reviennent chez plusieurs
 * articles d'abord, puis le poids de leurs graines ; les articles déjà vus, favoris ou écartés (`exclude`) sont retirés.
 */
export function planRecommendations(
  seeds: SeedMeta[],
  weight: Map<string, number>,
  exclude: ReadonlySet<string>,
  maxTopics: number,
  maxRelated = 18,
): RecommendationPlan {
  const title = (w: SeedMeta) => (w.display_name ?? w.title ?? "").trim() || "un article";
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

  const relatedRanked = [...related.entries()]
    .filter(([rid]) => !exclude.has(rid))
    .sort((a, b) => b[1].seeds.length - a[1].seeds.length || b[1].score - a[1].score)
    .slice(0, maxRelated);
  return {
    relatedIds: relatedRanked.map(([rid]) => rid),
    relatedSeeds: new Map(relatedRanked.map(([rid, r]) => [rid, r.seeds])),
    topics: [...topics.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, maxTopics)
      .map(([id, t]) => ({ id, name: t.name, seeds: t.seeds })),
  };
}

/**
 * Alternance apparenté / sujet, sans doublon ni déjà-vu. `perTopic[k]` = articles récents du sujet `plan.topics[k]` ;
 * les sujets se relaient rang par rang (le 1er de chaque sujet, puis le 2e…).
 */
export function interleaveRecommendations(
  plan: RecommendationPlan,
  relatedWorks: Work[],
  perTopic: Work[][],
  exclude: ReadonlySet<string>,
  results: number,
): Recommendation[] {
  const relatedQueue: Recommendation[] = relatedWorks.map((w) => ({ work: w, reason: { kind: "related", seeds: plan.relatedSeeds.get(shortId(w.id)) ?? [] } }));
  const topicQueue: Recommendation[] = [];
  for (let i = 0; i < results; i++) {
    plan.topics.forEach((t, k) => {
      const w = perTopic[k]?.[i];
      if (w) topicQueue.push({ work: w, reason: { kind: "topic", topic: t.name, seeds: t.seeds.slice(0, 1) } });
    });
  }

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
  while (out.length < results && (relatedQueue.length || topicQueue.length)) {
    take(relatedQueue);
    if (out.length < results) take(topicQueue);
  }
  return out;
}
