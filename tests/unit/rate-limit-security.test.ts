import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { rejectCrossSite, rejectLargeBody } from "@/lib/security";

describe("rateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("laisse passer `limit` requêtes par fenêtre, puis refuse", () => {
    const key = "test:limite";
    const results = Array.from({ length: 5 }, () => rateLimit(key, 3, 60_000));
    expect(results).toEqual([true, true, true, false, false]);
  });

  it("repart à zéro à la fin de la fenêtre", () => {
    const key = "test:fenetre";
    rateLimit(key, 1, 60_000);
    expect(rateLimit(key, 1, 60_000)).toBe(false);
    vi.advanceTimersByTime(59_999);
    expect(rateLimit(key, 1, 60_000)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(rateLimit(key, 1, 60_000)).toBe(true);
  });

  it("compte chaque clé séparément", () => {
    expect(rateLimit("test:a", 1, 60_000)).toBe(true);
    expect(rateLimit("test:b", 1, 60_000)).toBe(true);
    expect(rateLimit("test:a", 1, 60_000)).toBe(false);
  });

  it("reste correct après le ménage des clés expirées (plus de 10 000 clés)", () => {
    for (let i = 0; i < 10_001; i++) rateLimit(`test:masse:${i}`, 1, 1_000);
    vi.advanceTimersByTime(1_000);
    expect(rateLimit("test:apres-menage", 1, 60_000)).toBe(true);
    expect(rateLimit("test:apres-menage", 1, 60_000)).toBe(false);
    expect(rateLimit("test:masse:0", 1, 1_000)).toBe(true);
  });
});

describe("clientIp", () => {
  it("premier élément de x-forwarded-for, depuis une requête ou des en-têtes", () => {
    expect(clientIp(new Request("https://s.test/", { headers: { "x-forwarded-for": " 203.0.113.7 , 10.0.0.1" } }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-forwarded-for": "198.51.100.2" }))).toBe("198.51.100.2");
  });

  it("« anon » sans en-tête exploitable", () => {
    expect(clientIp(new Headers())).toBe("anon");
    expect(clientIp(new Headers({ "x-forwarded-for": " ,1.2.3.4" }))).toBe("anon");
  });
});

describe("rejectCrossSite (CSRF)", () => {
  const post = (headers: Record<string, string>) => new Request("https://sextant.test/api/favorites", { method: "POST", headers });

  it("laisse passer une requête du même site", () => {
    expect(rejectCrossSite(post({ "sec-fetch-site": "same-origin", origin: "https://sextant.test", host: "sextant.test" }))).toBeNull();
  });

  it("laisse passer une requête sans Origin (client non navigateur, pas de risque CSRF)", () => {
    expect(rejectCrossSite(post({ host: "sextant.test" }))).toBeNull();
  });

  it("refuse Sec-Fetch-Site: cross-site", async () => {
    const res = rejectCrossSite(post({ "sec-fetch-site": "cross-site", host: "sextant.test" }));
    expect(res?.status).toBe(403);
    expect(await res?.json()).toEqual({ error: "Requête refusée." });
  });

  it("refuse une Origin qui ne correspond pas à l'hôte (navigateur sans Sec-Fetch-Site)", () => {
    expect(rejectCrossSite(post({ origin: "https://attaquant.test", host: "sextant.test" }))?.status).toBe(403);
  });

  it("compare Origin à x-forwarded-host en priorité (derrière le proxy Vercel)", () => {
    expect(rejectCrossSite(post({ origin: "https://sextant.test", "x-forwarded-host": "sextant.test", host: "interne.vercel" }))).toBeNull();
    expect(rejectCrossSite(post({ origin: "https://interne.vercel", "x-forwarded-host": "sextant.test", host: "interne.vercel" }))?.status).toBe(403);
  });

  it("refuse une Origin illisible (« null » des iframes sandbox)", () => {
    expect(rejectCrossSite(post({ origin: "null", host: "sextant.test" }))?.status).toBe(403);
  });
});

describe("rejectLargeBody", () => {
  const withLength = (n?: number) => new Request("https://sextant.test/api/x", { method: "POST", headers: n === undefined ? {} : { "content-length": String(n) } });

  it("refuse un corps annoncé au-delà de la borne (413)", () => {
    expect(rejectLargeBody(withLength(16_385))?.status).toBe(413);
    expect(rejectLargeBody(withLength(40_000), 32_768)?.status).toBe(413);
  });

  it("accepte un corps dans la borne ou sans taille annoncée", () => {
    expect(rejectLargeBody(withLength(16_384))).toBeNull();
    expect(rejectLargeBody(withLength())).toBeNull();
  });
});
