import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, makeNonce } from "@/lib/csp";

/**
 * CSP à nonce (SEC-03, étape 2), en Report-Only : un nonce neuf par page, transmis à Next par l'en-tête de requête
 * (Next le lit dans `content-security-policy-report-only` et l'ajoute à ses propres scripts) et à layout.tsx par
 * `x-nonce` (script de thème). Toutes les pages sont déjà dynamiques (layout.tsx lit le cookie de session) : aucun
 * coût de rendu en plus. Les autres en-têtes de sécurité, fixes, sont posés par next.config.ts.
 */
export function proxy(request: NextRequest) {
  const nonce = makeNonce();
  const csp = buildCsp({
    nonce,
    dev: process.env.NODE_ENV === "development",
    firebaseProject: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    // En développement, la console suffit : pas de rapports envoyés au serveur local.
    reportUri: process.env.NODE_ENV === "production" ? "/api/csp-report" : undefined,
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy-report-only", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy-report-only", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages seulement : ni API, ni fichiers statiques (Next, PDF.js, icônes, manifeste, robots), ni pages d'aide
      // Firebase relayées (/__/auth/*), ni préchargements de liens.
      source: "/((?!api/|_next/static|_next/image|pdfjs/|__/auth/|favicon\\.ico|robots\\.txt|manifest\\.webmanifest|.*\\.(?:png|svg|ico|jpg|webp|txt|xml|mjs|js|css|map)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
