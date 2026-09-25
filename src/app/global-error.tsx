"use client";

import "./globals.css";
import { ServerError } from "@/components/server-error";
import { PRE_HYDRATION_SCRIPT } from "@/lib/pre-hydration";

/** Erreur dans la mise en page racine elle-même : document complet, sans en-tête ni pied de page. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <title>Erreur · Sextant</title>
        <meta name="robots" content="noindex" />
        {/* Même thème que le site, lu avant l'affichage (ce document remplace la mise en page racine) ; autorisé par la CSP via son empreinte. */}
        <script dangerouslySetInnerHTML={{ __html: PRE_HYDRATION_SCRIPT }} />
      </head>
      <body className="min-h-full bg-background text-base text-foreground antialiased">
        <main>
          <ServerError error={error} retry={retry} />
        </main>
      </body>
    </html>
  );
}
