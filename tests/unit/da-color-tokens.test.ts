import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { THEMES } from "@/lib/themes";

const src = path.resolve(__dirname, "../../src");
const css = readFileSync(path.join(src, "app/globals.css"), "utf8");

/** Variables déclarées dans les blocs `:root` (clair) ou `.dark` (sombre) de globals.css, la dernière déclaration l'emportant. */
function tokens(selector: ":root" | ".dark"): Record<string, string> {
  const out: Record<string, string> = {};
  const head = selector === ":root" ? ":root" : "\\.dark";
  for (const block of css.matchAll(new RegExp(`^${head} \\{([\\s\\S]*?)^\\}`, "gm"))) {
    for (const m of block[1].matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)) out[m[1]] = m[2].trim();
  }
  return out;
}

const light = tokens(":root");
const dark = { ...light, ...tokens(".dark") };

/** Valeur hexadécimale d'une variable, `var(--x)` résolu dans le même thème. */
function hex(theme: Record<string, string>, name: string): string {
  let value = theme[name];
  for (let i = 0; value?.startsWith("var("); i++) {
    if (i > 5) break;
    value = theme[value.slice(4, -1).trim()];
  }
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${name} n'est pas un hexadécimal opaque : ${value}`);
  return value;
}

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

describe("pastilles des thématiques (P1)", () => {
  it("chaque thématique a sa couleur de pastille", () => {
    // Couleur propre à chaque thématique, rétablie à la demande de Lucas (29/09) : repère visuel des 16 disciplines.
    for (const t of THEMES) expect(t.tone).toMatch(/^bg-[a-z]+-\d{3}$/);
  });

  it("plus aucune couleur de la palette Tailwind dans l'interface : tout passe par les tokens", () => {
    const palette =
      /\b(?:bg|text|fill|stroke|border|ring|from|to|via|outline|decoration|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;
    const offenders = (readdirSync(src, { recursive: true }) as string[])
      .filter((f) => /\.(tsx?|css)$/.test(f))
      // Seule exception : les pastilles des thématiques (lib/themes.ts).
      .filter((f) => !f.endsWith(path.join("lib", "themes.ts")))
      .filter((f) => palette.test(readFileSync(path.join(src, f), "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("cœur des favoris en bleu de marque (P2)", () => {
  it("--favorite : bleu de marque en clair, bleu éclairci en sombre", () => {
    expect(hex(light, "--favorite")).toBe(hex(light, "--link"));
    expect(hex(dark, "--favorite")).toBe(hex(dark, "--link"));
  });

  it.each([
    ["clair", light],
    ["sombre", dark],
  ])("icône à 3:1 au moins sur le fond, la carte et la teinte (%s)", (_, theme) => {
    for (const surface of ["--background", "--card", "--tint"]) {
      expect(contrast(hex(theme, "--favorite"), hex(theme, surface))).toBeGreaterThanOrEqual(3);
    }
  });

  it("couleurs forcées : le cœur suit le système (ButtonText), plein quand l'article est enregistré", () => {
    const button = readFileSync(path.join(src, "components/favorites/favorite-button.tsx"), "utf8");
    expect(button).toMatch(/"size-\[18px\][^"]*forced-colors:text-\[color:ButtonText\]/);
    expect(button).toMatch(/active \? "fill-favorite text-favorite forced-colors:fill-\[ButtonText\]"/);
  });

  it("survol de « Enregistré » (bouton secondary) : mélange sans teinte parasite, donc pas de rose", () => {
    const ui = readFileSync(path.join(src, "components/ui/button.tsx"), "utf8");
    expect(ui).toContain("hover:bg-[color-mix(in_oklab,var(--secondary),var(--foreground)_5%)]");
    expect(ui).not.toMatch(/hover:bg-\[color-mix\(in_oklch,var\(--secondary\)/);
  });
});

describe("surligneur (T15)", () => {
  it("clair inchangé : jaune de fluo voilé à 55 %, trait ocre, pas de trait sous les passages des cartes", () => {
    expect(light["--highlight"]).toBe("color-mix(in oklch, oklch(0.92 0.17 96) 55%, transparent)");
    expect(light["--highlight-foreground"]).toBe("oklch(0.6 0.13 80)");
    expect(light["--highlight-text-line"]).toBe("transparent");
  });

  it("sombre (option A) : fond bleu opaque, trait jaune --sun opaque", () => {
    expect(hex(dark, "--highlight")).toBe("#27346F");
    expect(hex(dark, "--highlight-foreground")).toBe(hex(light, "--sun"));
    expect(hex(dark, "--highlight-text-line")).toBe(hex(light, "--sun"));
  });

  it("sombre : texte surligné à 4,5:1, trait à 3:1 sur le surlignage comme autour", () => {
    const fill = hex(dark, "--highlight");
    const line = hex(dark, "--highlight-foreground");
    expect(contrast(hex(dark, "--foreground"), fill)).toBeGreaterThanOrEqual(4.5);
    for (const surface of [fill, hex(dark, "--background"), hex(dark, "--card"), hex(dark, "--popover")]) {
      expect(contrast(line, surface)).toBeGreaterThanOrEqual(3);
    }
  });

  it("résumé et cartes lisent le même fond ; les couleurs forcées reprennent le surlignage système", () => {
    expect(css).toMatch(/mark\[data-highlight\] \{\s*background: var\(--highlight\);/);
    expect(css).toMatch(/\.hl-text \{\s*background-image: linear-gradient\(transparent 52%, var\(--highlight\) 52%\);/);
    const forced = [...css.matchAll(/@media \(forced-colors: active\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join("\n");
    expect(forced).toMatch(/mark\[data-highlight\] \{\s*background: Mark;\s*color: MarkText;/);
    expect(forced).toMatch(/\.hl-text \{\s*background: Mark;\s*color: MarkText;/);
  });
});
