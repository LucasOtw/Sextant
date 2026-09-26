import { describe, expect, it, vi } from "vitest";

/**
 * Fiche article pendant une panne passagère d'OpenAlex : jamais de noindex (servi en 200 à Googlebot, il retirerait
 * l'article de l'index) ; un robot servi en rendu bloquant reçoit l'erreur (réponse 5xx, temporaire pour lui).
 */
const state = vi.hoisted(() => ({ ua: "", fail: true }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "user-agent": state.ua }) }));
vi.mock("@/lib/openalex", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/openalex")>();
  return {
    ...mod,
    getWork: async () => {
      if (state.fail) throw new mod.OpenAlexError("OpenAlex 429", 429);
      return null;
    },
  };
});

const { generateMetadata } = await import("@/app/article/[id]/page");
const meta = () => generateMetadata({ params: Promise.resolve({ id: "W4406431707" }) });

describe("fiche article, OpenAlex en panne : métadonnées", () => {
  it("visiteur : titre « momentanément indisponible », sans noindex", async () => {
    state.ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0 Safari/537.36";
    const m = await meta();
    expect(m.title).toBe("Article momentanément indisponible");
    expect(m.robots).toBeUndefined();
  });

  it("Googlebot (rendu bloquant) : l'erreur remonte, pour une réponse 5xx au lieu d'un 200 + noindex", async () => {
    state.ua = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
    await expect(meta()).rejects.toThrow("OpenAlex 429");
  });

  it("article vraiment absent : noindex gardé", async () => {
    state.fail = false;
    expect((await meta()).robots).toEqual({ index: false });
  });
});
