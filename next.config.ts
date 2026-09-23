import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pas de badge Next.js en bas à gauche en développement (captures d'écran propres).
  devIndicators: false,
  // firebase-admin (et ses dépendances Google Cloud) ne supportent pas d'être bundlés : chargés tels quels côté serveur.
  serverExternalPackages: ["firebase-admin"],
  // Firebase Auth : les pages d'aide (/__/auth/*) sont servies depuis notre domaine, pour que
  // la connexion Google fonctionne malgré le blocage des cookies tiers (Safari, Chrome).
  async rewrites() {
    const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!project) return [];
    return [{ source: "/__/auth/:path*", destination: `https://${project}.firebaseapp.com/__/auth/:path*` }];
  },
};

export default nextConfig;
