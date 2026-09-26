import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Point d'entrée unique du condensé IA (QUAL-22) : `generate` choisit le fournisseur, et les erreurs du SDK Anthropic
 * sont traduites en `AiError` dans lib/ai, comme celles des fournisseurs compatibles OpenAI. SDK et réseau simulés.
 */
const sdk = vi.hoisted(() => {
  class APIError extends Error {
    constructor(public status?: number) {
      super(`HTTP ${status ?? "?"}`);
    }
  }
  class AuthenticationError extends APIError {}
  class RateLimitError extends APIError {}
  class APIConnectionError extends APIError {}
  const create = vi.fn();
  const options: unknown[] = [];
  class Anthropic {
    static APIError = APIError;
    static AuthenticationError = AuthenticationError;
    static RateLimitError = RateLimitError;
    static APIConnectionError = APIConnectionError;
    beta = { messages: { create } };
    constructor(o: unknown) {
      options.push(o);
    }
  }
  return { Anthropic, create, options, APIError, AuthenticationError, RateLimitError, APIConnectionError };
});
vi.mock("@anthropic-ai/sdk", () => ({ default: sdk.Anthropic }));
vi.mock("@/lib/log", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/log")>()), logError: vi.fn() }));

const { AiError, generate } = await import("@/lib/ai");

const message = (stop_reason: string | null, text = " Condensé ") => ({ stop_reason, content: [{ type: "text", text }] });

describe("generate", () => {
  beforeEach(() => {
    sdk.create.mockReset();
    sdk.options.length = 0;
  });

  it("fournisseur compatible OpenAI : appel chat/completions", async () => {
    vi.stubEnv("MISTRAL_API_KEY", "cle-de-test");
    const fetch = vi.fn(async () => Response.json({ choices: [{ message: { content: "Texte" }, finish_reason: "stop" }] }));
    vi.stubGlobal("fetch", fetch);
    await expect(generate("mistral", "consigne", "résumé")).resolves.toEqual({ text: "Texte", complete: true, finish: "stop" });
    expect(fetch).toHaveBeenCalledWith("https://api.mistral.ai/v1/chat/completions", expect.anything());
    expect(sdk.create).not.toHaveBeenCalled();
  });

  it("Anthropic : consigne et modèle transmis, délai borné, sans relance ; fin normale = complet", async () => {
    sdk.create.mockResolvedValue(message("end_turn"));
    await expect(generate("anthropic", "consigne", "résumé")).resolves.toEqual({ text: "Condensé", complete: true, finish: "end_turn" });
    expect(sdk.options[0]).toEqual({ timeout: 20_000, maxRetries: 0 });
    expect(sdk.create).toHaveBeenCalledWith(expect.objectContaining({ model: "claude-haiku-4-5", system: "consigne", messages: [{ role: "user", content: "résumé" }] }));
  });

  it("Anthropic : réponse coupée (max_tokens) montrée mais pas complète ; refus et réponse vide = erreur", async () => {
    sdk.create.mockResolvedValueOnce(message("max_tokens"));
    await expect(generate("anthropic", "c", "r")).resolves.toMatchObject({ complete: false, finish: "max_tokens" });
    sdk.create.mockResolvedValueOnce(message("refusal"));
    await expect(generate("anthropic", "c", "r")).rejects.toMatchObject({ status: 502 });
    sdk.create.mockResolvedValueOnce(message("end_turn", "  "));
    await expect(generate("anthropic", "c", "r")).rejects.toMatchObject({ status: 502 });
  });

  it.each([
    ["clé refusée", () => new sdk.AuthenticationError(401), 500],
    ["quota", () => new sdk.RateLimitError(429), 429],
    ["délai ou réseau", () => new sdk.APIConnectionError(), 504],
    ["autre erreur HTTP", () => new sdk.APIError(529), 502],
  ])("Anthropic, %s : AiError %i", async (_, error, status) => {
    sdk.create.mockRejectedValue(error());
    const e = await generate("anthropic", "c", "r").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(AiError);
    expect((e as InstanceType<typeof AiError>).status).toBe(status);
  });
});
