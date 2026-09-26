import { describe, expect, it } from "vitest";
import { buildCsp, makeNonce, summarizeCspReport } from "@/lib/csp";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `));

describe("buildCsp (SEC-03)", () => {
  const prod = buildCsp({ nonce: "abc123", dev: false, firebaseProject: "sextant-test", reportUri: "/api/csp-report" });

  it("scripts : nonce + strict-dynamic, sans unsafe-inline ni unsafe-eval en production", () => {
    expect(directive(prod, "script-src")).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic' https://apis.google.com");
    expect(prod).not.toContain("'unsafe-eval'");
    expect(directive(prod, "script-src")).not.toContain("'unsafe-inline'");
  });

  it("laisse passer Firebase Auth, PDF.js, le repli <object> et les avatars Google", () => {
    expect(directive(prod, "frame-src")).toContain("https://sextant-test.firebaseapp.com");
    expect(directive(prod, "connect-src")).toContain("https://identitytoolkit.googleapis.com");
    expect(directive(prod, "connect-src")).toContain("https://securetoken.googleapis.com");
    expect(directive(prod, "worker-src")).toBe("worker-src 'self' blob:");
    expect(directive(prod, "object-src")).toBe("object-src 'self' https:");
    expect(directive(prod, "img-src")).toContain("https://*.googleusercontent.com");
  });

  it("interdit l'encadrement par un autre site et les <base> étrangères ; rapports en production", () => {
    expect(directive(prod, "frame-ancestors")).toBe("frame-ancestors 'self'");
    expect(directive(prod, "base-uri")).toBe("base-uri 'self'");
    expect(directive(prod, "report-uri")).toBe("report-uri /api/csp-report");
  });

  it("développement : unsafe-eval et WebSocket du rechargement à chaud, pas de rapports", () => {
    const dev = buildCsp({ nonce: "n", dev: true, firebaseProject: "p" });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "connect-src")).toContain("ws:");
    expect(dev).not.toContain("report-uri");
  });

  it("domaine d'auth personnalisé ajouté aux cadres autorisés", () => {
    expect(directive(buildCsp({ nonce: "n", dev: false, firebaseProject: "p", authDomain: " auth.exemple.fr " }), "frame-src")).toContain("https://auth.exemple.fr");
  });
});

describe("makeNonce", () => {
  it("128 bits en base64, différent à chaque appel", () => {
    const a = makeNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(makeNonce()).not.toBe(a);
  });
});

describe("summarizeCspReport (journal des violations)", () => {
  it("ne garde que la directive, les origines et la section de la page (jamais un jeton de liste)", () => {
    const out = summarizeCspReport({
      "document-uri": "https://sextant.test/liste/jeton-secret-123?x=1",
      "effective-directive": "script-src-elem",
      "blocked-uri": "https://cdn.exemple.com/a.js?session=abc",
      "source-file": "https://sextant.test/_next/static/chunks/x.js",
      disposition: "report",
    });
    expect(out).toEqual({
      level: "warn",
      scope: "csp.report",
      directive: "script-src-elem",
      blocked: "https://cdn.exemple.com",
      source: "https://sextant.test",
      page: "/liste",
      disposition: "report",
    });
    expect(JSON.stringify(out)).not.toContain("jeton-secret");
  });

  it("garde tels quels les mots-clés inline / eval", () => {
    expect(summarizeCspReport({ "blocked-uri": "inline", "violated-directive": "script-src" })).toMatchObject({ blocked: "inline", directive: "script-src" });
  });
});
