import { NextResponse } from "next/server";
import { WORK_ID } from "@/lib/favorites-shared";
import { workTitle } from "@/lib/format";
import { getRecentByTopic, getWorksByIds, shortId, type Work } from "@/lib/openalex";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_SEEDS = 8;
const MAX_TOPICS = 3;
const RESULTS = 6;

export interface Recommendation {
  work: Work;
  /** Pourquoi : le sujet partagé et l'article consulté qui l'a fait remonter. */
  reason: { topic: string; seedId: string; seedTitle: string };
}

/**
 * « Pour vous », première marche sans algorithme : les sujets OpenAlex (primary_topic) des articles fournis,
 * puis les articles récents les plus cités de ces sujets, sans le déjà-vu. Explicable ligne par ligne.
 * Public et sans compte : les identifiants viennent de l'historique local du navigateur ; rien n'est gardé côté serveur.
 */
export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!rateLimit(`reco:${ip}`, 30, 60_000)) return NextResponse.json({ error: "Trop de requêtes." }, { status: 429 });
  const seen = (new URL(req.url).searchParams.get("seen") ?? "").split(",").map((x) => x.trim()).filter((x) => WORK_ID.test(x));
  if (seen.length === 0) return NextResponse.json({ items: [] });
  const seeds = seen.slice(0, MAX_SEEDS);

  try {
    const seedWorks = await getWorksByIds(seeds);
    // Sujets par fréquence, en gardant l'article le plus récent (premier de l'historique) comme justification.
    const topics = new Map<string, { name: string; seedId: string; seedTitle: string; hits: number }>();
    for (const w of seedWorks) {
      const t = w.primary_topic;
      if (!t) continue;
      const cur = topics.get(t.id);
      if (cur) cur.hits++;
      else topics.set(t.id, { name: t.display_name, seedId: shortId(w.id), seedTitle: workTitle(w), hits: 1 });
    }
    const chosen = [...topics.entries()].sort((a, b) => b[1].hits - a[1].hits).slice(0, MAX_TOPICS);
    if (chosen.length === 0) return NextResponse.json({ items: [] }, { headers: { "cache-control": "public, max-age=300, s-maxage=3600" } });

    const since = new Date().getFullYear() - 4;
    const perTopic = await Promise.all(chosen.map(([id]) => getRecentByTopic(id, since, RESULTS).catch(() => [] as Work[])));
    const exclude = new Set(seen);
    const out: Recommendation[] = [];
    const used = new Set<string>();
    // Un sujet à la fois, en alternance : de la diversité plutôt qu'un seul sujet qui écrase les autres.
    for (let i = 0; out.length < RESULTS && perTopic.some((list) => list.length > i); i++) {
      chosen.forEach(([, meta], k) => {
        const w = perTopic[k][i];
        if (!w || out.length >= RESULTS) return;
        const id = shortId(w.id);
        if (exclude.has(id) || used.has(id)) return;
        used.add(id);
        out.push({ work: w, reason: { topic: meta.name, seedId: meta.seedId, seedTitle: meta.seedTitle } });
      });
    }
    return NextResponse.json({ items: out }, { headers: { "cache-control": "public, max-age=300, s-maxage=3600" } });
  } catch {
    return NextResponse.json({ error: "Recommandations indisponibles." }, { status: 502 });
  }
}
