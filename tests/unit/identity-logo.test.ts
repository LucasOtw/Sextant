import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

const root = path.resolve(__dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const logo = read("src/components/logo.tsx");
const icon = read("public/icon.svg");
const docsLogo = read("docs/logo.svg");
const og = read("scripts/og-image.html");
const generator = read("scripts/generate-icons.mjs");
const css = read("src/app/globals.css");

/** Palette de la DA (docs/handoffs/2026-09-26-da-brief.md) et jaune sombre accordé des graduations (--sun-deep). */
const PALETTE = ["#F9F8F2", "#0D111A", "#566ED1", "#D7A848", "#7A5C1C", "#EEF1FB"];

/**
 * Tracés du logo (attributs d des path), dans l'ordre : la géométrie de référence est celle de LogoMark. L'astre y est
 * une constante (ASTRE), partagée avec l'étoile du hero : elle est relue à part.
 */
const paths = (source: string) => [...source.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
const logoShapes = [...paths(logo), ...[...logo.matchAll(/export const ASTRE = "([^"]+)"/g)].map((m) => m[1])];

function luminance(color: string): number {
  const n = parseInt(color.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("logo aux couleurs de la DA (M10)", () => {
  it("LogoMark passe par les tokens : bleu de marque, jaune, jaune sombre, cadre en currentColor ; aucun hex codé en dur", () => {
    // Le commentaire d'en-tête cite les valeurs ; seul le dessin (la fonction) est vérifié.
    expect(logo.slice(logo.indexOf("export function"))).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    for (const cls of ["stroke-sun", "stroke-sun-deep", "fill-brand", "stroke-brand", "fill-sun"]) expect(logo).toContain(`"${cls}"`);
    expect(logo).toContain('stroke="currentColor"');
  });

  it("--sun-deep : même teinte que le jaune, assez sombre pour que les graduations se lisent sur l'arc", () => {
    expect(css).toMatch(/--sun-deep: #7A5C1C;/);
    expect(css).toMatch(/--color-sun-deep: var\(--sun-deep\);/);
    expect(contrast("#7A5C1C", "#D7A848")).toBeGreaterThanOrEqual(2.5);
  });

  it.each([
    ["public/icon.svg", icon],
    ["docs/logo.svg", docsLogo],
    ["scripts/og-image.html", og],
    ["scripts/generate-icons.mjs", generator],
  ])("%s : même géométrie que LogoMark et uniquement des couleurs de la palette", (_, source) => {
    expect(logoShapes).toHaveLength(5);
    for (const shape of logoShapes) expect(paths(source)).toContain(shape);
    const colors = [...source.matchAll(/#[0-9a-f]{6}\b/gi)].map((m) => m[0].toUpperCase());
    expect(colors.filter((c) => !PALETTE.includes(c))).toEqual([]);
  });
});

describe("icônes du site", () => {
  it("chaque icône du manifeste et des métadonnées existe dans public/", () => {
    for (const { src } of manifest().icons ?? []) expect(existsSync(path.join(root, "public", src)), src).toBe(true);
    for (const file of ["favicon.ico", "apple-touch-icon.png"]) expect(existsSync(path.join(root, "public", file)), file).toBe(true);
  });

  it("favicon.ico : trois images PNG de 16, 32 et 48 px", () => {
    const ico = readFileSync(path.join(root, "public/favicon.ico"));
    expect(ico.readUInt16LE(2)).toBe(1);
    const count = ico.readUInt16LE(4);
    const sizes = Array.from({ length: count }, (_, i) => {
      const offset = ico.readUInt32LE(6 + 16 * i + 12);
      expect(ico.subarray(offset, offset + 4).toString("latin1")).toBe("\x89PNG");
      return ico.readUInt8(6 + 16 * i);
    });
    expect(sizes).toEqual([16, 32, 48]);
  });
});

describe("image de partage (M11)", () => {
  it("polices locales seulement : aucune adresse externe dans la source", () => {
    expect(og).not.toMatch(/https?:\/\//);
    // Mêmes fichiers que le site (src/app/fonts/), sans copie à part.
    for (const font of ["Fredoka-latin.woff2", "Nunito-latin.woff2"]) {
      expect(og).toContain(`url("../src/app/fonts/${font}")`);
      expect(existsSync(path.join(root, "src/app/fonts", font)), font).toBe(true);
    }
  });

  it("fond bleu de marque, texte #EEF1FB en grande taille uniquement (≥ 24 px, 3:1 au moins)", () => {
    expect(og).toMatch(/background: #566ed1;/i);
    expect(og).toMatch(/color: #eef1fb;/i);
    expect(contrast("#EEF1FB", "#566ED1")).toBeGreaterThanOrEqual(3);
    const sizes = [...og.matchAll(/font-size: (\d+)px/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(24);
  });

  it("logo sur une pastille crème", () => {
    expect(og).toMatch(/\.badge \{[^}]*background: #f9f8f2;/i);
  });
});
