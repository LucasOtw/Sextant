import { describe, expect, it, vi } from "vitest";
import { isPlausiblyRecent, shortId, withCredentials } from "@/lib/openalex";

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
