import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { activeProvider, AiError, completeOpenAiCompatible, modelFor } from "@/lib/ai";
import { abstractFromInvertedIndex, formatAuthors, venueName, workTitle } from "@/lib/format";
import { getWork } from "@/lib/openalex";

export const runtime = "nodejs";

/** Cache mémoire par instance : un résumé par article et par modèle. */
const cache = new Map<string, string>();

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

  let id: string | undefined;
  try {
    ({ id } = (await req.json()) as { id?: string });
  } catch {
    /* corps invalide */
  }
  if (!id || !/^W\d+$/i.test(id)) {
    return NextResponse.json({ error: "Identifiant d'article invalide." }, { status: 400 });
  }

  const model = modelFor(provider);
  const cacheKey = `${model}:${id}`;
  const cached = cache.get(cacheKey);
  if (cached) return NextResponse.json({ summary: cached, model, cached: true });

  const work = await getWork(id).catch(() => null);
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
    cache.set(cacheKey, text);
    return NextResponse.json({ summary: text, model });
  } catch (e) {
    if (e instanceof AiError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: "Clé API invalide côté serveur." }, { status: 500 });
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "Trop de demandes, réessayez dans un instant." }, { status: 429 });
    if (e instanceof Anthropic.APIError) return NextResponse.json({ error: `Erreur du service IA (${e.status}).` }, { status: 502 });
    throw e;
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
