import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { activeProvider, AiError, completeOpenAiCompatible, modelFor } from "@/lib/ai";
import { WORK_ID } from "@/lib/favorites-shared";
import { abstractFromInvertedIndex, formatAuthors, venueName, workTitle } from "@/lib/format";
import { logError } from "@/lib/log";
import { getWork, type Work } from "@/lib/openalex";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { rejectCrossSite, rejectLargeBody } from "@/lib/security";

export const runtime = "nodejs";
/** Au-delà du délai de l'appel IA (20 s) et de la lecture OpenAlex : la réponse reste un JSON lisible. */
export const maxDuration = 30;

/** Cache mémoire par instance : un résumé par article et par modèle, borné (les plus anciens sortent d'abord). */
const cache = new Map<string, string>();
const CACHE_MAX = 500;

const SYSTEM = `Tu aides des étudiants et chercheurs francophones à évaluer rapidement un article scientifique.
À partir des métadonnées et du résumé original fournis, rédige en français une synthèse fidèle en 4 points courts, un par ligne, sans titre, sans puces, sans numéro :
la question ou l'objectif de l'étude ;
la méthode ou l'approche ;
le résultat principal ;
ce que cela implique ou une limite notable.
N'invente rien qui ne soit pas dans le résumé. Si une information manque, dis-le en une phrase plutôt que de la deviner. Pas d'introduction, pas de conclusion, pas de mise en forme.`;

export async function POST(req: Request) {
  const provider = activeProvider();
  if (!provider) {
    return NextResponse.json({ error: "Résumé IA désactivé sur ce déploiement." }, { status: 503 });
  }

  // Appel payant ou sous quota : pas de requête venue d'un autre site, pas de corps « text/plain » sans préflight.
  const refused = rejectCrossSite(req) ?? rejectLargeBody(req, 1_024);
  if (refused) return refused;
  if (!req.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 415 });
  }

  let bodyId: unknown;
  try {
    bodyId = ((await req.json()) as { id?: unknown }).id;
  } catch {
    /* corps invalide */
  }
  const id = typeof bodyId === "string" ? bodyId.toUpperCase() : "";
  if (!WORK_ID.test(id)) {
    return NextResponse.json({ error: "Identifiant d'article invalide." }, { status: 400 });
  }

  const model = modelFor(provider);
  const cacheKey = `${model}:${id}`;
  const cached = cache.get(cacheKey);
  if (cached) return NextResponse.json({ summary: cached, model, cached: true });

  // Le cache ne coûte rien ; la limite ne compte que les synthèses à générer (limite par instance, comme /api/pdf).
  if (!rateLimit(`summary:${clientIp(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: "Trop de synthèses demandées, réessayez dans une minute." }, { status: 429 });
  }

  let work: Work | null;
  try {
    work = await getWork(id);
  } catch (e) {
    // Panne ou limite d'OpenAlex : ce n'est pas un article absent.
    logError("summary.getWork", e, { work: id });
    return NextResponse.json({ error: "Article momentanément indisponible, réessayez." }, { status: 502 });
  }
  if (!work) return NextResponse.json({ error: "Article introuvable." }, { status: 404 });
  const abstract = abstractFromInvertedIndex(work.abstract_inverted_index);
  if (!abstract) return NextResponse.json({ error: "Pas de résumé original à synthétiser." }, { status: 422 });

  const userContent = [
    `Titre : ${workTitle(work)}`,
    `Auteurs : ${formatAuthors(work, 5)}`,
    venueName(work) ? `Revue : ${venueName(work)} (${work.publication_year ?? "année inconnue"})` : null,
    "",
    "Résumé original :",
    abstract,
  ]
    .filter((l) => l !== null)
    .join("\n");

  try {
    const raw = provider === "anthropic" ? await completeAnthropic(model, userContent) : await completeOpenAiCompatible(provider, SYSTEM, userContent);
    const text = stripMarkdown(raw);
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(cacheKey, text);
    return NextResponse.json({ summary: text, model });
  } catch (e) {
    if (e instanceof AiError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof Anthropic.AuthenticationError) {
      logError("summary.anthropicKey", e);
      return NextResponse.json({ error: "Clé API invalide côté serveur." }, { status: 500 });
    }
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "Trop de demandes, réessayez dans un instant." }, { status: 429 });
    if (e instanceof Anthropic.APIError) {
      logError("summary.anthropic", e);
      return NextResponse.json({ error: `Erreur du service IA (${e.status}).` }, { status: 502 });
    }
    // Erreur inattendue : trace côté serveur, et toujours un JSON lisible pour le client (jamais un corps vide).
    logError("summary.POST", e, { work: id });
    return NextResponse.json({ error: "Synthèse indisponible pour le moment, réessayez." }, { status: 502 });
  }
}

/** Les petits modèles glissent parfois du gras/italique ou des puces malgré la consigne. */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*?([^*\n]+)\*\*?/g, "$1")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "")
    .trim();
}

async function completeAnthropic(model: string, userContent: string): Promise<string> {
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model,
    max_tokens: 1024,
    system: SYSTEM,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content: userContent }],
  });
  if (response.stop_reason === "refusal") throw new AiError("Le modèle n'a pas pu résumer cet article.", 502);
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!text) throw new AiError("Réponse vide.", 502);
  return text;
}
