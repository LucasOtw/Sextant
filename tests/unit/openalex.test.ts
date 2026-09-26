import { describe, expect, it, vi } from "vitest";
import { getAuthorProfile, getTopic, getWork, isPlausiblyRecent, retryBudget, shortId, withCredentials } from "@/lib/openalex";

describe("isPlausiblyRecent (garde de datation des listes récentes)", () => {
  const now = new Date("2026-09-25T12:00:00Z");
  const work = (id: string, year: number | null, created?: string) => ({ id: `https://openalex.org/${id}`, publication_year: year, created_date: created });

  it("accepte un article récent créé l'année de sa publication", () => {
    expect(isPlausiblyRecent(work("W4400000000", 2025, "2025-03-01"), now)).toBe(true);
  });

  it("tolère une fiche créée l'année précédant la publication (prépublication)", () => {
    expect(isPlausiblyRecent(work("W4400000000", 2025, "2024-11-30"), now)).toBe(true);
  });

  it("refuse un article sans année", () => {
    expect(isPlausiblyRecent(work("W4400000000", null), now)).toBe(false);
  });

  it("refuse une fiche créée bien avant sa date de publication (texte ancien re-daté)", () => {
    expect(isPlausiblyRecent(work("W4400000000", 2025, "2019-06-01"), now)).toBe(false);
  });

  it("refuse un identifiant hérité d'avant 2022 pour une date récente", () => {
    expect(isPlausiblyRecent(work("W2100000000", 2025), now)).toBe(false);
    expect(isPlausiblyRecent(work("W3999999999", 2023), now)).toBe(false);
  });

  it("accepte un identifiant hérité pour une date ancienne (hors fenêtre de trois ans)", () => {
    expect(isPlausiblyRecent(work("W2100000000", 2022), now)).toBe(true);
  });

  it("dépend de l'année courante passée en paramètre", () => {
    expect(isPlausiblyRecent(work("W2100000000", 2023), new Date("2030-01-01"))).toBe(true);
  });
});

describe("shortId", () => {
  it("retire le préfixe OpenAlex, http ou https", () => {
    expect(shortId("https://openalex.org/W123")).toBe("W123");
    expect(shortId("http://openalex.org/T10001")).toBe("T10001");
    expect(shortId("W123")).toBe("W123");
  });
});

describe("withCredentials", () => {
  it("ajoute la clé et un mailto valide", () => {
    vi.stubEnv("OPENALEX_API_KEY", " cle-de-test ");
    vi.stubEnv("OPENALEX_MAILTO", "contact@sextant.test");
    const url = withCredentials(new URL("https://api.openalex.org/works"));
    expect(url.searchParams.get("api_key")).toBe("cle-de-test");
    expect(url.searchParams.get("mailto")).toBe("contact@sextant.test");
  });

  it("n'ajoute ni clé absente ni mailto invalide ou factice", () => {
    vi.stubEnv("OPENALEX_API_KEY", "");
    for (const mailto of ["pas-un-email", "x@example.com"]) {
      vi.stubEnv("OPENALEX_MAILTO", mailto);
      const url = withCredentials(new URL("https://api.openalex.org/works"));
      expect(url.searchParams.has("api_key")).toBe(false);
      expect(url.searchParams.has("mailto")).toBe(false);
    }
  });
});

describe("identifiants dans le chemin OpenAlex (SEC-15)", () => {
  function captureFetch(): string[] {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: URL) => {
      urls.push(url.toString());
      return new Response("{}", { status: 404 });
    });
    return urls;
  }

  it("un `?`, un `#` ou un `/` ne sortent pas du segment : ni paramètre ajouté, ni traversée", async () => {
    const urls = captureFetch();
    await getWork("W2741809807?per-page=1");
    await getWork("W1/../W2741809807");
    await getTopic("T1#x");
    await getAuthorProfile("A1?filter=x");
    const [work, traversal, topic, author] = urls.map((u) => new URL(u));
    expect(work.pathname).toBe("/works/W2741809807%3Fper-page%3D1");
    expect(work.searchParams.has("per-page")).toBe(false);
    expect(traversal.pathname).toBe("/works/W1%2F..%2FW2741809807");
    expect(topic.pathname).toBe("/topics/T1%23x");
    expect(topic.hash).toBe("");
    expect(author.pathname).toBe("/authors/A1%3Ffilter%3Dx");
    expect(author.searchParams.has("filter")).toBe(false);
  });

  it("un identifiant ordinaire reste inchangé", async () => {
    const urls = captureFetch();
    await getWork("https://openalex.org/W2741809807");
    expect(new URL(urls[0]).pathname).toBe("/works/W2741809807");
  });
});

describe("retryBudget (budget global d'un appel OpenAlex, PERF-07)", () => {
  it("relance un statut passager reçu vite, dans le budget restant", () => {
    expect(retryBudget(429, 200)).toBe(8000 - 200 - 1200);
    expect(retryBudget(503, 0)).toBe(6800);
  });

  it("ne relance jamais un 504 (OpenAlex l'envoie après ~9 s) ni un statut définitif", () => {
    expect(retryBudget(504, 100)).toBeNull();
    expect(retryBudget(404, 100)).toBeNull();
    expect(retryBudget(200, 100)).toBeNull();
  });

  it("ne relance pas quand le budget restant, attente comprise, est trop court", () => {
    expect(retryBudget(502, 3800)).toBe(3000);
    expect(retryBudget(502, 3801)).toBeNull();
    expect(retryBudget(429, 7000)).toBeNull();
  });
});
