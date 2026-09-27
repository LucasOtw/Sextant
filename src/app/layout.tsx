import type { Metadata, Viewport } from "next";
import "./globals.css";
import { fontVariables } from "./fonts";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Toaster } from "@/components/ui/sonner";
import { FavoritesProvider } from "@/components/favorites/favorites-provider";
import { SessionProvider } from "@/components/auth/session-provider";
import { isAuthEnabled } from "@/lib/auth";
import { PRE_HYDRATION_SCRIPT } from "@/lib/pre-hydration";
import { ANNOUNCER_ID } from "@/lib/announce";
import { SkipLink } from "@/components/skip-link";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  // Base des adresses relatives (canoniques, image de partage) : l'adresse de production, y compris sur un déploiement de
  // prévisualisation (Vercel y ajoute de lui-même un en-tête noindex).
  metadataBase: new URL(SITE.url),
  title: { default: "Sextant — la littérature scientifique, sans détour", template: "%s · Sextant" },
  description:
    "Articles évalués par les pairs, thèses et ouvrages universitaires : recherche par mots-clés, métadonnées claires, accès ouvert, articles similaires.",
  // Fichiers statiques de public/ (favicon.ico y est aussi, pour les navigateurs et robots qui le demandent sans balise).
  icons: { icon: { url: "/icon.svg", type: "image/svg+xml" }, apple: "/apple-touch-icon.png" },
  // Aperçus de partage (QUAL-18) : ni titre ni description ici, Next reprend ceux de chaque page pour og:* et twitter:*,
  // et l'image vient de app/opengraph-image.png (source : scripts/og-image.html). Une page ne doit PAS définir son
  // propre `openGraph` : la fusion n'est pas profonde, il remplacerait celui-ci en entier (nom du site, langue, image).
  openGraph: { siteName: SITE.name, locale: "fr_FR", type: "website" },
  twitter: { card: "summary_large_image" },
};

/**
 * Barre du navigateur mobile aux couleurs du fond (--background clair / sombre de globals.css) selon le système ; la
 * bascule du site la recale ensuite (lib/theme.ts).
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F9F8F2" },
    { media: "(prefers-color-scheme: dark)", color: "#0D111A" },
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
    <html lang="fr" className={`${fontVariables} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Thème et indice de connexion appliqués avant le premier rendu (lib/pre-hydration.ts), autorisé par la CSP via son empreinte. */}
        <script dangerouslySetInnerHTML={{ __html: PRE_HYDRATION_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col text-base">
        {/* Premier arrêt au clavier : saute l'en-tête (A11Y-11). */}
        <SkipLink target="contenu">Aller au contenu</SkipLink>
        <SessionProvider enabled={isAuthEnabled()}>
          <FavoritesProvider>
            <SiteHeader />
            <main id="contenu" className="flex-1 outline-none">{children}</main>
            <SiteFooter />
          </FavoritesProvider>
        </SessionProvider>
        {/* Toasts d'information : 3,5 s. Ceux qui proposent « Annuler » durent plus longtemps (lib/undo-toast.ts). */}
        <Toaster position="bottom-right" duration={3500} />
        {/* Région d'annonce aux lecteurs d'écran, montée vide (lib/announce.ts) : « Copié », nombre de résultats… */}
        <div id={ANNOUNCER_ID} aria-live="polite" aria-atomic="true" className="sr-only" />
      </body>
    </html>
  );
}
