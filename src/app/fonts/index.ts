// Sous-ensembles chargés à la demande et polices de repli ajustées (cf. faces.css) : importés en premier pour que leurs
// @font-face précèdent ceux du latin, comme chez Google Fonts.
import "./faces.css";
import localFont from "next/font/local";

/**
 * Polices de la direction artistique (docs/handoffs/2026-09-26-da-audit.md, Y1) : Fredoka pour les titres (600) et les
 * accroches (500), Nunito pour le texte et l'interface (400, 600 et 700). Fichiers WOFF2 variables de Google Fonts
 * (Fredoka 2.001, Nunito 3.602), sous-ensembles inchangés, rangés dans ce dossier avec leurs licences SIL OFL 1.1 (cf.
 * LISEZ-MOI.md) : le build ne dépend plus du réseau et le site les sert lui-même (`/_next/static/media`), sans requête
 * vers Google à l'exécution ; la CSP garde `font-src 'self'`.
 *
 * Seul le sous-ensemble latin de chaque famille est déclaré ici et préchargé. Les autres sous-ensembles, dans
 * faces.css, portent le même nom de famille (celui de la constante, que `next/font/local` reprend) et ne se téléchargent
 * que si la page contient un de leurs caractères (unicode-range). Un glyphe absent de tous (grec, indices, symboles)
 * passe à la police de repli sans serif des piles de `globals.css`.
 *
 * Polices de repli ajustées (« Fredoka Fallback », « Nunito Fallback » : Arial aux métriques de la police, contre le
 * décalage au chargement) : déclarées à la main dans faces.css avec les valeurs de `next/font/google`. Celles que
 * `next/font/local` calculerait partent de l'instance par défaut des fichiers variables (Nunito ExtraLight, Fredoka
 * Light), plus étroite que le texte réel : Nunito aurait un repli réduit de 3 %.
 *
 * Les valeurs doivent rester littérales (contrainte de `next/font`) : les plages unicode sont celles de Google Fonts.
 * Fredoka est déclarée en 500 à 600 (les deux graisses utilisées) : une demande en 400 ou 700 est ramenée à la borne,
 * comme avec les deux faces 500 et 600 de Google.
 *
 * Module partagé : ses variables CSS sont posées sur <html> par `layout.tsx` et par `global-error.tsx`, qui remplace la
 * mise en page racine (sans elles, la page d'erreur retomberait en Times, Y2).
 */
const Fredoka = localFont({
  src: "./Fredoka-latin.woff2",
  style: "normal",
  weight: "500 600",
  variable: "--font-fredoka",
  // Repli aux métriques de Google Fonts, déclaré dans faces.css (cf. plus haut).
  adjustFontFallback: false,
  fallback: ["Fredoka Fallback"],
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
});

const Nunito = localFont({
  src: "./Nunito-latin.woff2",
  style: "normal",
  weight: "200 1000",
  variable: "--font-nunito",
  // Repli aux métriques de Google Fonts, déclaré dans faces.css (cf. plus haut).
  adjustFontFallback: false,
  fallback: ["Nunito Fallback"],
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
});

export const fontVariables = `${Nunito.variable} ${Fredoka.variable}`;
