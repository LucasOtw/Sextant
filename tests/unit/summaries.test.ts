import { describe, expect, it } from "vitest";
import { summaryDocId } from "@/lib/summaries";

describe("identifiant des condensés persistés (PERF-15)", () => {
  it("encode le « / » des modèles OpenRouter, interdit dans un identifiant Firestore", () => {
    const id = summaryDocId("meta-llama/llama-3.3-70b-instruct:free", 1, "W123");
    expect(id).toBe("meta-llama%2Fllama-3.3-70b-instruct%3Afree__v1__W123");
    expect(id).not.toContain("/");
  });

  it("change avec la version de la consigne et le modèle", () => {
    expect(summaryDocId("ministral-8b-latest", 2, "W1")).toBe("ministral-8b-latest__v2__W1");
    expect(summaryDocId("ministral-8b-latest", 1, "W1")).not.toBe(summaryDocId("mistral-small-latest", 1, "W1"));
  });
});
