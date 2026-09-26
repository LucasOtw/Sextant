import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { buildCsp, makeNonce, STATIC_PAGES, summarizeCspReport } from "@/lib/csp";
import { PRE_HYDRATION_SCRIPT, PRE_HYDRATION_SCRIPT_HASH } from "@/lib/pre-hydration";
import { NextRequest } from "next/server";
import { config, isRenderedOnRequest, proxy } from "@/proxy";
import { SESSION_COOKIE, SESSION_HINT_COOKIE } from "@/lib/session-shared";

// Le compilateur de motifs de Next lui-même (non typé), pour vérifier le `matcher` du proxy tel que Next l'applique.
const { pathToRegexp } = createRequire(import.meta.url)("next/dist/compiled/path-to-regexp") as {
  pathToRegexp: (source: string, keys: unknown[], options: { delimiter: string; sensitive: boolean; strict: boolean }) => RegExp;
};

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

describe("pages en cache et script d'avant hydratation (PERF-01)", () => {
  it("l'empreinte déclarée est bien celle du script (à recalculer à chaque modification)", () => {
    expect(PRE_HYDRATION_SCRIPT_HASH).toBe(`'sha256-${createHash("sha256").update(PRE_HYDRATION_SCRIPT).digest("base64")}'`);
  });

  it("avec un nonce : empreinte du script ajoutée, toujours sans unsafe-inline", () => {
    const csp = buildCsp({ nonce: "abc", scriptHashes: [PRE_HYDRATION_SCRIPT_HASH], dev: false, firebaseProject: "p" });
    expect(directive(csp, "script-src")).toBe(`script-src 'self' 'nonce-abc' ${PRE_HYDRATION_SCRIPT_HASH} 'strict-dynamic' https://apis.google.com`);
  });

  it("sans nonce (page en cache) : scripts en ligne admis, sans empreinte ni strict-dynamic qui les désactiveraient", () => {
    const csp = buildCsp({ nonce: null, scriptHashes: [PRE_HYDRATION_SCRIPT_HASH], dev: false, firebaseProject: "p" });
    expect(directive(csp, "script-src")).toBe("script-src 'self' 'unsafe-inline' https://apis.google.com");
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'self'");
  });

  it("le proxy ne passe pas sur les pages en cache, mais sur toutes les pages rendues à la demande", () => {
    const re = pathToRegexp(config.matcher[0].source, [], { delimiter: "/", sensitive: false, strict: true });
    for (const page of STATIC_PAGES) expect(re.test(page), page).toBe(false);
    for (const page of ["/search", "/article/W1", "/article/W1/lire", "/theme/informatique", "/favoris", "/citations", "/compte", "/retours", "/liste/abc", "/inconnue"]) {
      expect(re.test(page), page).toBe(true);
    }
    for (const asset of ["/api/favorites", "/icon.svg", "/_next/static/x.js", "/pdfjs/6/pdf.worker.mjs", "/__/auth/handler"]) expect(re.test(asset), asset).toBe(false);
    // Seules les charges RSC du routeur sont écartées : un document demandé avec « Purpose: prefetch » (préchargement
    // ou prérendu par le navigateur) sera affiché tel quel et doit recevoir son nonce et sa politique.
    const missing = config.matcher[0].missing ?? [];
    expect(missing).toEqual([{ type: "header", key: "next-router-prefetch" }]);
    expect(missing.some((m) => m.key.toLowerCase() === "purpose" || m.key.toLowerCase() === "sec-purpose")).toBe(false);
  });

  it("seconde entrée : les pages en cache, seulement pour rattraper l'indice d'une session ouverte avant lui", () => {
    const entry = config.matcher[1];
    const re = pathToRegexp(entry.source, [], { delimiter: "/", sensitive: false, strict: true });
    for (const page of STATIC_PAGES) expect(re.test(page), page).toBe(true);
    for (const page of ["/search", "/favoris", "/article/W1", "/a-propos/x", "/api/favorites", "/inconnue"]) expect(re.test(page), page).toBe(false);
    expect(entry.has).toEqual([{ type: "cookie", key: SESSION_COOKIE }]);
    expect(entry.missing).toEqual([{ type: "cookie", key: SESSION_HINT_COOKIE }]);
  });

  it("nonce réservé aux pages rendues à la demande ; une 404 prérendue reçoit la politique sans nonce", () => {
    for (const page of ["/search", "/favoris", "/citations", "/compte", "/retours", "/article/W123", "/article/W123/lire", "/article/xyz", "/liste/tok", "/theme/informatique", "/search/"]) {
      expect(isRenderedOnRequest(page), page).toBe(true);
    }
    for (const page of ["/inconnue", "/theme/inconnu", "/article/W1/autre", "/wp-login.php", "/favoris/x"]) expect(isRenderedOnRequest(page), page).toBe(false);
  });
});

describe("proxy : nonce transmis à Next (SEC-03)", () => {
  it("passe la politique à Next sous l'en-tête de requête content-security-policy, le navigateur ne reçoit que la version Report-Only", () => {
    const res = proxy(new NextRequest("https://sextant.test/search?q=climat"));
    // Surcharge d'en-tête de requête (lue par Next au rendu) : nom standard, sinon Vercel ne la transmet pas au rendu.
    const forwarded = res.headers.get("x-middleware-request-content-security-policy");
    expect(forwarded).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    expect(res.headers.get("x-middleware-request-content-security-policy-report-only")).toBeNull();
    // Réponse : politique Report-Only avec le même nonce, jamais la version appliquée.
    const reportOnly = res.headers.get("content-security-policy-report-only");
    expect(reportOnly).toBe(forwarded);
    expect(res.headers.get("content-security-policy")).toBeNull();
  });
});
