import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Polices embarquées dans le dépôt (src/app/fonts/) : le build ne télécharge plus rien chez Google. Vérifie la
 * déclaration (next/font/local pour le latin préchargé, faces.css pour les autres sous-ensembles et les replis), les
 * fichiers eux-mêmes (WOFF2 valides, glyphes du français, axes de graisse) et leurs licences.
 */
const root = path.resolve(__dirname, "../..");
const dir = path.join(root, "src/app/fonts");
const read = (file: string) => readFileSync(path.join(dir, file), "utf8");

const index = read("index.ts");
const faces = read("faces.css");

// Lecteur de polices embarqué par Next (celui dont next/font/local se sert pour les métriques).
const require = createRequire(import.meta.url);
const fontkitModule = require("next/dist/compiled/@next/font/dist/fontkit");
const openFont: (buffer: Buffer) => {
  familyName: string;
  variationAxes: Record<string, { min: number; max: number }>;
  hasGlyphForCodePoint(codePoint: number): boolean;
} = fontkitModule.default ?? fontkitModule;

const FAMILIES = [
  { name: "Fredoka", variable: "--font-fredoka", weights: [500, 600] },
  { name: "Nunito", variable: "--font-nunito", weights: [400, 600, 700] },
] as const;

/** Appel localFont d'une famille dans index.ts (la constante porte le nom de la famille). */
function localFontCall(family: string): string {
  const match = index.match(new RegExp(`const ${family} = localFont\\(\\{([\\s\\S]*?)\\n\\}\\);`));
  if (!match) throw new Error(`appel localFont introuvable pour ${family}`);
  return match[1];
}

/** « U+0000-00FF, U+0131 » → intervalles de points de code. */
function parseRanges(value: string): [number, number][] {
  return value.split(",").map((part) => {
    const [start, end = start] = part.trim().replace(/^U\+/i, "").split("-");
    return [parseInt(start, 16), parseInt(end, 16)];
  });
}
const covers = (ranges: [number, number][], cp: number) => ranges.some(([a, b]) => cp >= a && cp <= b);

/** @font-face de faces.css : famille, fichier et plage. */
const cssFaces = [...faces.matchAll(/@font-face \{([^}]*)\}/g)].map(([, body]) => ({
  family: body.match(/font-family: "?([^";]+)"?;/)?.[1],
  file: body.match(/url\("\.\/([^"]+)"\)/)?.[1],
  range: body.match(/unicode-range: ([^;]+);/)?.[1],
  body,
}));

// Texte français courant : accents, ligatures œ æ, guillemets, apostrophe et tirets typographiques, points de suspension,
// espace insécable, euro, degré.
const FRENCH = "àâäçéèêëîïôöùûüÿœæÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŒÆ«»‹›’‘“”–—…\u00A0€°";
// L'espace fine insécable (U+202F, posée par lib/text.ts avant ; ! ?) est dans la plage latine mais ni Fredoka ni
// Nunito ne la dessinent (fichiers de Google, déjà le cas avant) : elle vient du repli ajusté (Arial), sans téléchargement.
const NARROW_NBSP = 0x202f;
// Latin étendu : Ÿ (seule capitale du français hors du sous-ensemble latin de Google) et noms propres d'auteurs et de
// revues (tchèque, polonais, hongrois, roumain, turc).
const LATIN_EXT = "Ÿřšžčěůłśźżńőűşțğ";

describe("polices embarquées (src/app/fonts)", () => {
  it("plus aucun next/font/google dans le code : le build ne dépend plus du réseau", () => {
    const sources: string[] = [];
    const walk = (folder: string) => {
      for (const entry of readdirSync(folder, { withFileTypes: true })) {
        const full = path.join(folder, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx|css|mjs|js)$/.test(entry.name)) sources.push(full);
      }
    };
    walk(path.join(root, "src"));
    for (const file of sources) expect(readFileSync(file, "utf8"), file).not.toMatch(/["']next\/font\/google["']/);
    expect(index).toContain('import localFont from "next/font/local";');
  });

  it("faces.css est importé avant les appels localFont (sous-ensembles déclarés avant le latin, comme chez Google)", () => {
    expect(index.indexOf('import "./faces.css";')).toBeGreaterThanOrEqual(0);
    expect(index.indexOf('import "./faces.css";')).toBeLessThan(index.indexOf("next/font/local"));
  });

  for (const family of FAMILIES) {
    describe(family.name, () => {
      const call = localFontCall(family.name);
      const latinRange = parseRanges(call.match(/prop: "unicode-range",\s*value:\s*"([^"]+)"/)![1]);
      const latinFile = call.match(/src: "\.\/([^"]+)"/)![1];

      it("latin préchargé, même variable CSS, repli ajusté déclaré dans faces.css", () => {
        expect(latinFile).toBe(`${family.name}-latin.woff2`);
        expect(call).not.toMatch(/preload: false/);
        expect(call).toContain(`variable: "${family.variable}"`);
        expect(index).toContain(`${family.name}.variable`);
        expect(call).toContain("adjustFontFallback: false");
        expect(call).toContain(`fallback: ["${family.name} Fallback"]`);
        const fallback = cssFaces.find((f) => f.family === `${family.name} Fallback`);
        expect(fallback?.body).toContain('src: local("Arial");');
        for (const prop of ["ascent-override", "descent-override", "line-gap-override", "size-adjust"]) {
          expect(fallback?.body).toMatch(new RegExp(`${prop}: [\\d.]+%;`));
        }
      });

      it("le fichier latin couvre le français (plage et glyphes) et les graisses utilisées", () => {
        const font = openFont(readFileSync(path.join(dir, latinFile)));
        expect(font.familyName).toContain(family.name);
        for (const char of FRENCH) {
          const cp = char.codePointAt(0)!;
          expect(covers(latinRange, cp), `U+${cp.toString(16)} dans la plage`).toBe(true);
          expect(font.hasGlyphForCodePoint(cp), `glyphe ${char}`).toBe(true);
        }
        expect(covers(latinRange, NARROW_NBSP)).toBe(true);
        const axis = font.variationAxes.wght;
        for (const weight of family.weights) expect(weight >= axis.min && weight <= axis.max, `graisse ${weight}`).toBe(true);
      });

      it("latin étendu déclaré dans faces.css, avec les glyphes des noms propres", () => {
        const ext = cssFaces.find((f) => f.family === family.name && f.file === `${family.name}-latin-ext.woff2`);
        expect(ext?.range).toBeDefined();
        const extRange = parseRanges(ext!.range!);
        const files = [latinFile, ...cssFaces.filter((f) => f.family === family.name && f.file).map((f) => f.file!)];
        const fonts = files.map((file) => openFont(readFileSync(path.join(dir, file))));
        for (const char of LATIN_EXT) {
          const cp = char.codePointAt(0)!;
          expect(covers(extRange, cp), `U+${cp.toString(16)} dans la plage`).toBe(true);
          // Fredoka ne dessine pas tout le latin étendu : le glyphe manquant passe au repli sans serif (globals.css).
          if (family.name === "Nunito") expect(fonts.some((f) => f.hasGlyphForCodePoint(cp)), `glyphe ${char}`).toBe(true);
        }
      });
    });
  }

  it("chaque fichier WOFF2 du dossier est déclaré une fois, est un WOFF2 valide, et le poids reste raisonnable", () => {
    const woff2 = readdirSync(dir).filter((f) => f.endsWith(".woff2"));
    const referenced = [
      ...[...index.matchAll(/src: "\.\/([^"]+\.woff2)"/g)].map((m) => m[1]),
      ...cssFaces.filter((f) => f.file).map((f) => f.file!),
    ];
    expect([...referenced].sort()).toEqual([...woff2].sort());
    for (const face of cssFaces.filter((f) => f.file)) {
      expect(["Fredoka", "Nunito"], face.file).toContain(face.family);
      expect(face.range, face.file).toBeDefined();
      expect(face.body, face.file).toContain("font-display: swap;");
    }
    let total = 0;
    for (const file of woff2) {
      const buffer = readFileSync(path.join(dir, file));
      expect(buffer.subarray(0, 4).toString("latin1"), file).toBe("wOF2");
      total += statSync(path.join(dir, file)).size;
    }
    const preloaded = ["Fredoka-latin.woff2", "Nunito-latin.woff2"].reduce((sum, f) => sum + statSync(path.join(dir, f)).size, 0);
    expect(preloaded).toBeLessThan(80 * 1024);
    expect(total).toBeLessThan(250 * 1024);
  });

  it("licences SIL OFL à côté des fichiers", () => {
    for (const [file, copyright] of [
      ["OFL-Fredoka.txt", "The Fredoka Project Authors"],
      ["OFL-Nunito.txt", "The Nunito Project Authors"],
    ]) {
      const text = read(file);
      expect(text).toContain(copyright);
      expect(text).toContain("SIL OPEN FONT LICENSE Version 1.1");
    }
  });
});
