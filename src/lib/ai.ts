/**
 * Résumé IA : fournisseurs interchangeables via variables d'environnement.
 * Par défaut : Mistral (modèles ouverts, hébergement européen, offre gratuite « Experiment »).
 * Groq et OpenRouter sont possibles, tous compatibles avec le format « chat/completions ». Anthropic reste possible.
 */

export type Provider = "groq" | "mistral" | "openrouter" | "anthropic";

interface ProviderConfig {
  baseUrl: string;
  key: string;
  defaultModel: string;
}

const CONFIGS: Record<Exclude<Provider, "anthropic">, Omit<ProviderConfig, "key"> & { envKey: string }> = {
  // Gratuit avec quotas généreux, modèles open-weight (Llama, gpt-oss…). https://console.groq.com
  groq: { baseUrl: "https://api.groq.com/openai/v1", envKey: "GROQ_API_KEY", defaultModel: "llama-3.3-70b-versatile" },
  // Offre « Experiment » gratuite, modèles ouverts français. https://console.mistral.ai
  mistral: { baseUrl: "https://api.mistral.ai/v1", envKey: "MISTRAL_API_KEY", defaultModel: "ministral-8b-latest" },
  // Modèles suffixés « :free » sans coût. https://openrouter.ai
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", envKey: "OPENROUTER_API_KEY", defaultModel: "meta-llama/llama-3.3-70b-instruct:free" },
};

/** Fournisseur actif : AI_PROVIDER explicite, sinon le premier dont la clé est présente. */
export function activeProvider(): Provider | null {
  const forced = process.env.AI_PROVIDER as Provider | undefined;
  if (forced) return forced;
  if (process.env.MISTRAL_API_KEY) return "mistral";
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

export function isAiEnabled(): boolean {
  return activeProvider() !== null;
}

export function modelFor(provider: Provider): string {
  if (process.env.AI_MODEL) return process.env.AI_MODEL;
  return provider === "anthropic" ? "claude-opus-5" : CONFIGS[provider].defaultModel;
}

export class AiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** Appel « chat/completions » (Groq, Mistral, OpenRouter). Renvoie le texte de la réponse. */
export async function completeOpenAiCompatible(
  provider: Exclude<Provider, "anthropic">,
  system: string,
  user: string,
): Promise<string> {
  const cfg = CONFIGS[provider];
  const key = process.env[cfg.envKey];
  if (!key) throw new AiError(`Clé ${cfg.envKey} absente.`, 503);

  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      ...(provider === "openrouter" ? { "x-title": "Sourcier" } : {}),
    },
    body: JSON.stringify({
      model: modelFor(provider),
      temperature: 0.3,
      max_tokens: 700,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (res.status === 429) throw new AiError("Quota gratuit atteint, réessayez dans un instant.", 429);
  if (res.status === 401 || res.status === 403) throw new AiError("Clé API refusée par le fournisseur.", 500);
  if (!res.ok) throw new AiError(`Erreur du fournisseur IA (${res.status}).`, 502);

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new AiError("Réponse vide du fournisseur IA.", 502);
  return text;
}
