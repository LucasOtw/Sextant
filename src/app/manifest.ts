import type { MetadataRoute } from "next";

/**
 * Manifeste web, prérendu en statique à /manifest.webmanifest : icône nette à l'ajout à l'écran d'accueil.
 * Couleurs = fond clair du thème (--background) et fond de l'icône. Icônes générées depuis public/icon.svg.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sextant",
    short_name: "Sextant",
    description: "La littérature scientifique, sans détour.",
    lang: "fr",
    start_url: "/",
    display: "browser",
    background_color: "#F9F6F1",
    theme_color: "#1D1F2A",
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { src: "/icon-512.png", type: "image/png", sizes: "512x512" },
      { src: "/icon-maskable-512.png", type: "image/png", sizes: "512x512", purpose: "maskable" },
    ],
  };
}
