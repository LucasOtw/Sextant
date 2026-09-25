import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pas de badge Next.js en bas à gauche en développement (captures d'écran propres).
  devIndicators: false,
  // firebase-admin (et ses dépendances Google Cloud) ne supportent pas d'être bundlés : chargés tels quels côté serveur.
  serverExternalPackages: ["firebase-admin"],
  // Worker et ressources PDF.js : chemin versionné (public/pdfjs/<version>/, cf. scripts/copy-pdfjs-assets.mjs),
  // donc cache immuable sans risque — plus de revalidation (304) à chaque ouverture du lecteur.
  async headers() {
    return [{ source: "/pdfjs/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] }];
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
