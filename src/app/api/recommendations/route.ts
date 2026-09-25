import { NextResponse } from "next/server";
import { getQualityWorksByIds, getRecentByTopic, getSeedMeta, type Work } from "@/lib/openalex";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { interleaveRecommendations, parseIds, planRecommendations, seedWeights, topSeedIds } from "@/lib/recommendations-rank";
import { logError, recover } from "@/lib/log";

export const runtime = "nodejs";

const RESULTS = 6;
const MAX_TOPICS = 3;
const MAX_SEEDS = 20;

/**
 * Allège un article pour la carte compacte (PERF-25) : ni affiliations ni identifiants d'auteurs (le résumé n'est déjà
 * pas demandé à OpenAlex, cf. RECO_SELECT).
 * On garde le nom de chaque auteur : « et N autres » et l'instantané de favori (BibTeX, APA) en dépendent,
 * comme `doi`, `open_access`, `primary_topic` et le nom de la revue.
 */
function slim(w: Work): Work {
  const source = (loc: Work["primary_location"]) =>
    loc && { ...loc, source: loc.source && { id: loc.source.id, display_name: loc.source.display_name, type: null } };
  return {
    ...w,
    authorships: w.authorships.map((a) => ({
      author_position: a.author_position,
      author: { id: null, display_name: a.author.display_name, orcid: null },
      institutions: [],
    })),
    primary_location: source(w.primary_location),
    best_oa_location: source(w.best_oa_location),
  };
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
  const seen = parseIds(params.get("seen"), 12);
  const fav = parseIds(params.get("fav"), 30);
  const hide = parseIds(params.get("hide"), 200);
  const cache = { "cache-control": "public, max-age=300, s-maxage=3600" };
  if (seen.length === 0 && fav.length === 0) return NextResponse.json({ items: [] }, { headers: cache });

  // Classement pur (src/lib/recommendations-rank.ts) : ce handler ne fait que les appels à OpenAlex.
  const weight = seedWeights(fav, seen);
  const exclude = new Set([...seen, ...fav, ...hide]);

  try {
    const seeds = await getSeedMeta(topSeedIds(weight, MAX_SEEDS));
    const plan = planRecommendations(seeds, weight, exclude, MAX_TOPICS);
    const since = new Date().getFullYear() - 4;

    const [relatedWorks, perTopic] = await Promise.all([
      getQualityWorksByIds(plan.relatedIds).catch(recover("recommendations.related", [] as Work[])),
      Promise.all(plan.topics.map((t) => getRecentByTopic(t.id, since, RESULTS).catch(recover("recommendations.topic", [] as Work[])))),
    ]);

    const out = interleaveRecommendations(plan, relatedWorks, perTopic, exclude, RESULTS).map((r) => ({ ...r, work: slim(r.work) }));
    return NextResponse.json({ items: out }, { headers: cache });
  } catch (e) {
    logError("recommendations.GET", e);
    return NextResponse.json({ error: "Recommandations indisponibles." }, { status: 502 });
  }
}
