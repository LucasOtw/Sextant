import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Toaster } from "@/components/ui/sonner";
import { FavoritesProvider } from "@/components/favorites/favorites-provider";
import { SessionProvider } from "@/components/auth/session-provider";
import { isAuthEnabled } from "@/lib/auth";
import { PRE_HYDRATION_SCRIPT } from "@/lib/pre-hydration";

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Sextant — la littérature scientifique, sans détour", template: "%s · Sextant" },
  description:
    "Articles évalués par les pairs, thèses et ouvrages universitaires : recherche par mots-clés, métadonnées claires, accès ouvert, articles similaires.",
  // Fichiers statiques de public/ (favicon.ico y est aussi, pour les navigateurs et robots qui le demandent sans balise).
  icons: { icon: { url: "/icon.svg", type: "image/svg+xml" }, apple: "/apple-touch-icon.png" },
};

/** Barre du navigateur mobile aux couleurs du fond (--background clair / sombre) ; suit le thème du système, pas la bascule du site. */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F9F6F1" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0A0A" },
  ],
};

/**
 * Mise en page commune, sans lecture de la requête (ni cookie de session, ni en-têtes) : les pages qui n'en lisent
 * pas elles-mêmes (accueil, pages légales) sont prérendues et mises en cache au bord, identiques pour tous (PERF-01).
 * L'identité est donc connue côté client seulement (SessionProvider) ; une page qui affiche des données du compte lit
 * elle-même la session et reste rendue à la demande.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${sans.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Thème et indice de connexion appliqués avant le premier rendu (lib/pre-hydration.ts), autorisé par la CSP via son empreinte. */}
        <script dangerouslySetInnerHTML={{ __html: PRE_HYDRATION_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col text-base">
        <SessionProvider enabled={isAuthEnabled()}>
          <FavoritesProvider>
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </FavoritesProvider>
        </SessionProvider>
        <Toaster position="bottom-right" duration={3500} />
      </body>
    </html>
  );
}
