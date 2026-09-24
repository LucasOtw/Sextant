/**
 * Ressources de PDF.js (worker, WASM, polices, CMaps, ICC) copiées au postinstall sous un chemin versionné
 * (scripts/copy-pdfjs-assets.mjs) et servies en cache immuable (next.config.ts). Le chemin est dérivé de la version
 * de la bibliothèque réellement chargée : le worker correspond toujours à l'API.
 */
export function pdfjsAssetsBase(version: string): string {
  return `/pdfjs/${version}`;
}

let preloading: Promise<void> | null = null;

/**
 * Intention de lecture (survol, focus, toucher de « Lire le PDF ») : charge le module PDF.js et met le worker en cache
 * pendant la navigation vers le lecteur, au lieu de les enchaîner après son affichage. Une seule fois par page.
 */
export function preloadPdfReader(): void {
  preloading ??= import("pdfjs-dist")
    .then((pdfjs) => fetch(`${pdfjsAssetsBase(pdfjs.version)}/pdf.worker.min.mjs`))
    .then((res) => res.blob())
    .then(() => undefined)
    .catch(() => {
      preloading = null; // simple préchargement : le lecteur refera la demande
    });
}
