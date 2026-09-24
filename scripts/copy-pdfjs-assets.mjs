// Copie dans public/ les fichiers de PDF.js que le lecteur charge à la demande : worker, décodeurs WebAssembly
// (JBIG2, OpenJPEG, qcms), polices standard, CMaps, profils ICC. Exécuté au postinstall : la version suit toujours celle du paquet.
// Chemin versionné (public/pdfjs/<version>/) : servi en cache immuable (next.config.ts), et le lecteur le dérive de la
// version de la bibliothèque chargée (pdfjs.version) — bibliothèque et worker ne peuvent pas se désaccorder.
import { cpSync, mkdirSync, copyFileSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "pdfjs-dist");
const { version } = JSON.parse(readFileSync(join(src, "package.json"), "utf8"));
const base = join(root, "public", "pdfjs");
const dest = join(base, version);

// On repart de zéro : pas d'accumulation des anciennes versions (ni de l'ancien worker non versionné).
rmSync(base, { recursive: true, force: true });
rmSync(join(root, "public", "pdf.worker.min.mjs"), { force: true });
mkdirSync(dest, { recursive: true });
copyFileSync(join(src, "build", "pdf.worker.min.mjs"), join(dest, "pdf.worker.min.mjs"));
for (const dir of ["wasm", "standard_fonts", "cmaps", "iccs"]) {
  cpSync(join(src, dir), join(dest, dir), { recursive: true, filter: (p) => !/LICENSE/.test(p) });
}
console.log(`PDF.js ${version} : worker et ressources copiés dans public/pdfjs/${version}/`);
