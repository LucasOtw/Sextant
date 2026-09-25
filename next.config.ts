import type { NextConfig } from "next";
import { buildCsp, STATIC_PAGES } from "./src/lib/csp";

/**
 * En-têtes de sécurité fixes (SEC-03, étape 1), sur tout le site sauf les pages d'aide Firebase relayées
 * (/__/auth/*, cf. rewrites) qui gardent les leurs. La CSP à nonce, en Report-Only, est posée par src/proxy.ts ;
 * celle-ci, appliquée, ne porte que des directives sans risque de casse :
 * - frame-ancestors 'self' (et X-Frame-Options pour les anciens navigateurs) : aucun site tiers ne peut encadrer
 *   Sextant (habillage de phishing). 'self' plutôt que 'none' : l'iframe /__/auth/iframe doit rester encadrable par
 *   notre origine le jour où le domaine d'auth personnalisé est activé ;
 * - base-uri 'self' : pas de <base> injectée qui détournerait les adresses relatives.
 * Pas de Cross-Origin-Opener-Policy : la fenêtre Google de Firebase Auth doit garder son lien avec la page ; à ajouter
 * (same-origin-allow-popups) seulement après un essai de connexion sur un déploiement de prévisualisation.
 */
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  // Ignoré par les navigateurs en HTTP (développement) ; Vercel en pose déjà un, celui-ci couvre les sous-domaines.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

/**
 * CSP en Report-Only des pages en cache (PERF-01) : sans nonce (rendues une fois pour tous), donc scripts en ligne
 * admis ; les pages rendues à la demande reçoivent la leur, à nonce, de src/proxy.ts. Cf. lib/csp.ts.
 */
const STATIC_PAGE_CSP = buildCsp({
  nonce: null,
  dev: process.env.NODE_ENV === "development",
  firebaseProject: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  reportUri: process.env.NODE_ENV === "production" ? "/api/csp-report" : undefined,
});

const nextConfig: NextConfig = {
  // Pas de badge Next.js en bas à gauche en développement (captures d'écran propres).
  devIndicators: false,
  // Pas d'en-tête « x-powered-by: Next.js » : inutile de publier la pile technique.
  poweredByHeader: false,
  // firebase-admin (et ses dépendances Google Cloud) ne supportent pas d'être bundlés : chargés tels quels côté serveur.
  serverExternalPackages: ["firebase-admin"],
  // Worker et ressources PDF.js : chemin versionné (public/pdfjs/<version>/, cf. scripts/copy-pdfjs-assets.mjs),
  // donc cache immuable sans risque — plus de revalidation (304) à chaque ouverture du lecteur.
  async headers() {
    return [
      { source: "/:path((?!__/auth/).*)", headers: SECURITY_HEADERS },
      ...STATIC_PAGES.map((source) => ({ source, headers: [{ key: "Content-Security-Policy-Report-Only", value: STATIC_PAGE_CSP }] })),
      { source: "/pdfjs/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
  // Firebase Auth sur notre propre domaine (option, cf. src/lib/firebase/client.ts) : les pages d'aide (/__/auth/*)
  // sont alors servies depuis le site. Inactif tant que NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN n'est pas définie :
  // l'authDomain reste <projet>.firebaseapp.com et ce relais ne servirait à rien.
  async rewrites() {
    const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!project || !process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim()) return [];
    return [{ source: "/__/auth/:path*", destination: `https://${project}.firebaseapp.com/__/auth/:path*` }];
  },
};

export default nextConfig;
