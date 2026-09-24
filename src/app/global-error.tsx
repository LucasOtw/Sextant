"use client";

import "./globals.css";
import { ServerError } from "@/components/server-error";

/** Même thème que le site : lu avant l'affichage (ce document remplace la mise en page racine). */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");var d=t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches;if(d){document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark"}}catch(e){}})();`;

/** Erreur dans la mise en page racine elle-même : document complet, sans en-tête ni pied de page. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <title>Erreur · Sextant</title>
        <meta name="robots" content="noindex" />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full bg-background text-base text-foreground antialiased">
        <main>
          <ServerError error={error} retry={retry} />
        </main>
      </body>
    </html>
  );
}
