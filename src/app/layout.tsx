import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Toaster } from "@/components/ui/sonner";
import { FavoritesProvider } from "@/components/favorites/favorites-provider";
import { getCurrentUser, isAuthEnabled } from "@/lib/auth";

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

/** Applique le thème mémorisé (ou celui du système) avant le premier rendu, pour éviter le flash blanc. */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");var d=t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches;if(d){document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark"}}catch(e){}})();`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = isAuthEnabled() ? await getCurrentUser() : null;
  // Nonce de la CSP (src/proxy.ts) : sans lui, le script de thème serait refusé par la politique.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="fr" className={`${sans.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col text-base">
        <FavoritesProvider userId={user?.uid ?? null}>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </FavoritesProvider>
        <Toaster position="bottom-right" duration={3500} />
      </body>
    </html>
  );
}
