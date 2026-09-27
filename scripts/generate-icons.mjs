// Icônes du site régénérées depuis la géométrie du logo (src/components/logo.tsx), aux couleurs de la DA (M10).
//
//   node scripts/generate-icons.mjs
//
// Écrit public/icon.svg (pastille crème, favicon des navigateurs récents), docs/logo.svg (logo seul, cadre encre), puis
// les PNG et l'ICO dérivés : icon-192/512 (pastille aux coins arrondis), icon-maskable-512 et apple-touch-icon (fond
// plein, le système découpe lui-même), favicon.ico (16, 32 et 48 px, PNG embarqués). Rendu par sharp (librsvg).
// L'image de partage a sa propre source : scripts/og-image.html.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Palette (src/app/globals.css) : fond crème, encre, bleu de marque, jaune et jaune sombre accordé.
const CREAM = "#F9F8F2";
const INK = "#0D111A";
const BRAND = "#566ED1";
const SUN = "#D7A848";
const SUN_DEEP = "#7A5C1C";

/** Le logo, trait pour trait celui de LogoMark, avec le cadre en encre (pas de currentColor hors de la page). */
const LOGO = [
  `<path d="M12 44A36 36 0 0 0 52 44" stroke="${SUN}" stroke-width="5" stroke-linecap="round" fill="none"/>`,
  `<path d="M22 49.5v-3.5M32 50v-4M42 49.5v-3.5" stroke="${SUN_DEEP}" stroke-width="2" stroke-linecap="round" fill="none"/>`,
  `<path d="M12 44 32 14 52 44" stroke="${INK}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  `<rect x="17" y="30" width="7" height="7" rx="1.5" transform="rotate(-56 20.5 33.5)" fill="${BRAND}"/>`,
  `<path d="M32 14 44.3 47.8" stroke="${BRAND}" stroke-width="4" stroke-linecap="round" fill="none"/>`,
  `<circle cx="32" cy="14" r="3.5" fill="${BRAND}"/>`,
  `<path d="M53 4l1.8 4.7L59.5 10.5l-4.7 1.8L53 17l-1.8-4.7L46.5 10.5l4.7-1.8z" fill="${SUN}"/>`,
];

// Boîte du dessin, traits compris : du bout gauche du cadre (x 9,5, bout de l’arc) à la pointe de l'astre (x 59,5), de l'astre (y 4)
// au bas de l'arc (y 52,6). Son centre est ramené au centre de l'icône.
const CENTER = [34.5, 28.3];

/** Logo centré dans un carré de 64, à l'échelle `scale` (1 = 64 unités de dessin sur 64). */
function centered(scale) {
  return `<g transform="translate(32 32) scale(${scale}) translate(${-CENTER[0]} ${-CENTER[1]})">${LOGO.join("")}</g>`;
}

function svg(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">\n  ${body}\n</svg>\n`;
}

// Pastille aux coins arrondis : favicon, icônes du manifeste « any ».
const tile = svg(`<rect width="64" height="64" rx="14" fill="${CREAM}"/>\n  ${centered(0.86)}`);
// Fond plein : l'icône « maskable » garde le dessin dans le cercle de sécurité (rayon 40 %, soit 25,6 unités ; le point
// le plus éloigné, la pointe de l'astre, est à 30,5 unités du centre avant réduction), iOS arrondit lui-même les coins.
const maskable = svg(`<rect width="64" height="64" fill="${CREAM}"/>\n  ${centered(0.78)}`);
const apple = svg(`<rect width="64" height="64" fill="${CREAM}"/>\n  ${centered(0.84)}`);
const docsLogo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="128" height="128">\n  ${LOGO.join("\n  ")}\n</svg>\n`;

const png = (source, size) => sharp(Buffer.from(source), { density: (72 * size) / 64 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

/** ICO dont chaque image est un PNG (accepté par tous les navigateurs depuis Windows Vista). */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4); // plans
    header.writeUInt16LE(32, entry + 6); // bits par pixel
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

const out = (file, data) => {
  writeFileSync(path.join(root, file), data);
  console.log(file);
};

out("public/icon.svg", tile);
out("docs/logo.svg", docsLogo);
out("public/icon-192.png", await png(tile, 192));
out("public/icon-512.png", await png(tile, 512));
out("public/icon-maskable-512.png", await png(maskable, 512));
out("public/apple-touch-icon.png", await png(apple, 180));
out("public/favicon.ico", ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(tile, size) })))));
