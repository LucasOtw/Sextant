import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeWork } from "../fixtures";

/**
 * Condensé IA (PERF-15) : cache Firestore simulé, modèle simulé, jamais le vrai service ni la vraie base.
 */
const ai = vi.hoisted(() => ({ activeProvider: vi.fn(), modelFor: vi.fn(), completeOpenAiCompatible: vi.fn() }));
const summaries = vi.hoisted(() => ({ readStoredSummary: vi.fn(), storeSummary: vi.fn() }));
const openalex = vi.hoisted(() => ({ getWork: vi.fn() }));
vi.mock("@/lib/ai", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/ai")>()), ...ai }));
vi.mock("@/lib/summaries", () => summaries);
vi.mock("@/lib/openalex", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/openalex")>()), getWork: openalex.getWork }));

const { POST } = await import("@/app/api/summary/route");
const { AiError } = await import("@/lib/ai");

let ip = 0;
function post(id: string) {
  const req = new Request("https://sextant.test/api/summary", {
    method: "POST",
    // Une adresse par requête : la limite de débit (en mémoire) ne déborde pas d'un test à l'autre.
    headers: { "content-type": "application/json", origin: "https://sextant.test", host: "sextant.test", "x-forwarded-for": `203.0.113.${++ip}` },
    body: JSON.stringify({ id }),
  });
  return POST(req);
}

describe("POST /api/summary", () => {
  let n = 0;
  /** Un article différent par test : le cache mémoire de la route ne déborde pas d'un test à l'autre. */
  let id = "";
  beforeEach(() => {
    vi.clearAllMocks();
    id = `W42000000${10 + ++n}`;
    ai.activeProvider.mockReturnValue("mistral");
    ai.modelFor.mockReturnValue("ministral-8b-latest");
    ai.completeOpenAiCompatible.mockResolvedValue("**Question** posée\n- Méthode");
    summaries.readStoredSummary.mockResolvedValue(null);
    openalex.getWork.mockResolvedValue(makeWork({ abstract_inverted_index: { Un: [0], résumé: [1], original: [2] } }));
  });

  it("sert le condensé enregistré dans Firestore sans rappeler OpenAlex ni le modèle", async () => {
    summaries.readStoredSummary.mockResolvedValue("Déjà condensé");
    const res = await post(id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ summary: "Déjà condensé", cached: true });
    expect(summaries.readStoredSummary).toHaveBeenCalledWith("ministral-8b-latest", expect.any(Number), id);
    expect(openalex.getWork).not.toHaveBeenCalled();
    expect(ai.completeOpenAiCompatible).not.toHaveBeenCalled();
    expect(summaries.storeSummary).not.toHaveBeenCalled();
  });

  it("génère, enregistre le succès, puis sert la mémoire de l'instance sans relire Firestore", async () => {
    const res = await post(id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ summary: "Question posée\nMéthode" });
    expect(summaries.storeSummary).toHaveBeenCalledWith("ministral-8b-latest", expect.any(Number), id, "Question posée\nMéthode");

    summaries.readStoredSummary.mockClear();
    const again = await post(id);
    expect(await again.json()).toMatchObject({ summary: "Question posée\nMéthode", cached: true });
    expect(summaries.readStoredSummary).not.toHaveBeenCalled();
    expect(ai.completeOpenAiCompatible).toHaveBeenCalledTimes(1);
  });

  it("n'enregistre jamais une erreur du modèle", async () => {
    ai.completeOpenAiCompatible.mockRejectedValue(new AiError("Trop de demandes, réessayez dans un instant.", 429));
    const res = await post(id);
    expect(res.status).toBe(429);
    expect(summaries.storeSummary).not.toHaveBeenCalled();
  });

  it("refuse un identifiant invalide avant toute lecture", async () => {
    expect((await post("../W1")).status).toBe(400);
    expect(summaries.readStoredSummary).not.toHaveBeenCalled();
  });
});
