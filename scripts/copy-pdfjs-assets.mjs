// Copie dans public/ les fichiers de PDF.js que le lecteur charge à la demande : worker, décodeurs WebAssembly
// (JBIG2, OpenJPEG, qcms), polices standard, CMaps, profils ICC. Exécuté au postinstall : la version suit toujours celle du paquet.
import { cpSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "pdfjs-dist");
const dest = join(root, "public", "pdfjs");

mkdirSync(dest, { recursive: true });
copyFileSync(join(src, "build", "pdf.worker.min.mjs"), join(root, "public", "pdf.worker.min.mjs"));
for (const dir of ["wasm", "standard_fonts", "cmaps", "iccs"]) {
  cpSync(join(src, dir), join(dest, dir), { recursive: true, filter: (p) => !/LICENSE/.test(p) });
}
console.log("PDF.js : worker et ressources copiés dans public/");
