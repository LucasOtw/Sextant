import { Fredoka, Nunito } from "next/font/google";

/**
 * Polices de la direction artistique (docs/handoffs/2026-09-26-da-audit.md, Y1) : Fredoka pour les titres (600) et les
 * accroches (500), Nunito pour le texte et l'interface (400, 600 et 700, fichier variable). Téléchargées au build et
 * servies par le site (`/_next/static/media`) : aucune requête vers Google à l'exécution, la CSP garde `font-src 'self'`.
 * Seul le sous-ensemble latin est préchargé ; les autres (latin étendu…) restent déclarés et ne se chargent que si un
 * titre en contient. Un glyphe absent de ces polices (grec, indices, symboles) passe à la police de repli sans serif des
 * piles de `globals.css`.
 *
 * Module partagé : ses variables CSS sont posées sur <html> par `layout.tsx` et par `global-error.tsx`, qui remplace la
 * mise en page racine (sans elles, la page d'erreur retomberait en Times, Y2).
 */
const heading = Fredoka({ variable: "--font-fredoka", subsets: ["latin"], weight: ["500", "600"] });
const sans = Nunito({ variable: "--font-nunito", subsets: ["latin"] });

export const fontVariables = `${sans.variable} ${heading.variable}`;
