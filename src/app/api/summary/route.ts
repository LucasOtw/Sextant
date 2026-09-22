import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { abstractFromInvertedIndex, formatAuthors, venueName, workTitle } from "@/lib/format";
import { getWork } from "@/lib/openalex";

export const runtime = "nodejs";

const MODEL = process.env.AI_SUMMARY_MODEL ?? "claude-opus-5";

/** Cache mémoire par instance : un résumé par article, évite de payer deux fois le même. */
const cache = new Map<string, string>();

const SYSTEM = `Tu aides des étudiants et chercheurs francophones à évaluer rapidement un article scientifique.
À partir des métadonnées et du résumé original fournis, rédige en français une synthèse fidèle en 4 points courts, un par ligne, sans titre ni puces :
1. La question ou l'objectif de l'étude.
2. La méthode ou l'approche.
3. Le résultat principal.
4. Ce que cela implique ou une limite notable.
N'invente rien qui ne soit pas dans le résumé. Si une information manque, dis-le en une phrase plutôt que de la deviner. Pas d'introduction, pas de conclusion.`;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
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

  const cached = cache.get(id);
  if (cached) return NextResponse.json({ summary: cached, cached: true });

  const work = await getWork(id).catch(() => null);
  if (!work) return NextResponse.json({ error: "Article introuvable." }, { status: 404 });
  const abstract = abstractFromInvertedIndex(work.abstract_inverted_index);
  if (!abstract) return NextResponse.json({ error: "Pas de résumé original à synthétiser." }, { status: 422 });

  const client = new Anthropic();
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
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: userContent }],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "Le modèle n'a pas pu résumer cet article." }, { status: 502 });
    }
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!text) return NextResponse.json({ error: "Réponse vide." }, { status: 502 });

    cache.set(id, text);
    return NextResponse.json({ summary: text });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "Clé API invalide côté serveur." }, { status: 500 });
    }
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Trop de demandes, réessayez dans un instant." }, { status: 429 });
    }
    if (e instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `Erreur du service IA (${e.status}).` }, { status: 502 });
    }
    throw e;
  }
}
