import { describe, expect, it, vi } from "vitest";

// L'URL porte l'historique de lecture et les favoris : jamais de copie dans le cache partagé du CDN (SEC-18).
vi.mock("@/lib/openalex", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/openalex")>()),
  getSeedMeta: vi.fn(async () => []),
  getQualityWorksByIds: vi.fn(async () => []),
  getRecentByTopic: vi.fn(async () => []),
}));

const { GET } = await import("@/app/api/recommendations/route");

describe("GET /api/recommendations : cache privé", () => {
  it("sans graine : réponse vide, cache du navigateur seulement", async () => {
    const res = await GET(new Request("https://sextant.test/api/recommendations?seen=&fav=&hide=", { headers: { "x-forwarded-for": "203.0.113.7" } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, max-age=300");
  });

  it("avec graines : même en-tête, jamais s-maxage", async () => {
    const res = await GET(new Request("https://sextant.test/api/recommendations?seen=W4200000001&fav=W4200000002&hide=W4200000003", { headers: { "x-forwarded-for": "203.0.113.8" } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, max-age=300");
    expect(res.headers.get("cache-control")).not.toMatch(/public|s-maxage/);
  });
});
