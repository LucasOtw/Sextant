import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HERO_STAR, HERO_STROKE_PX, HERO_VIEWBOX, HERO_WAVE_GEOMETRY } from "@/components/hero-wave";
import { ASTRE, ASTRE_CENTER } from "@/components/logo";
import { wavePath } from "@/components/scene";
import { FOOTER_WAVE } from "@/components/site-footer";

const src = path.resolve(__dirname, "../../src");
const read = (file: string) => readFileSync(path.join(src, file), "utf8");
const css = read("app/globals.css");
const hero = read("components/hero-wave.tsx");
const footer = read("components/site-footer.tsx");
const home = read("app/page.tsx");

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

/** Points (x, y) d'un tracé de l'astre : un M puis des l / L, relatifs ou absolus. */
function astrePoints(d: string): [number, number][] {
  const points: [number, number][] = [];
  let [x, y] = [0, 0];
  for (const [, cmd, args] of d.matchAll(/([MLl])([^MLlz]+)/g)) {
    const [a, b] = (args.match(/-?\d*\.?\d+/g) ?? []).map(Number);
    [x, y] = cmd === "l" ? [x + a, y + b] : [a, b];
    points.push([x, y]);
  }
  return points;
}

describe("vague et étoile du hero", () => {
  const { x0, y, period, amplitude, count } = HERO_WAVE_GEOMETRY;
  /** Échelle du dessin au plus étroit : 65 % de 288 px (écran de 320 px moins les marges de 16 px). */
  const minScale = (0.65 * 288) / HERO_VIEWBOX.width;
  const halfStroke = Math.max(HERO_STROKE_PX.base, HERO_STROKE_PX.sm) / 2;

  it("la vague, bouts arrondis compris, tient dans le viewBox à 320 px", () => {
    const end = x0 + (count * period) / 2;
    const margin = HERO_STROKE_PX.base / 2 / minScale;
    expect(x0 - margin).toBeGreaterThanOrEqual(0);
    expect(end + margin).toBeLessThanOrEqual(HERO_VIEWBOX.width);
    expect(y + amplitude + margin).toBeLessThanOrEqual(HERO_VIEWBOX.height);
    expect(y - amplitude - margin).toBeGreaterThanOrEqual(0);
    // À partir de sm, l'écran fait au moins 640 px : l'échelle dépasse 1,5.
    expect(y + amplitude + halfStroke / 1.5).toBeLessThanOrEqual(HERO_VIEWBOX.height);
    expect(hero).toContain(`stroke-${HERO_STROKE_PX.base} sm:stroke-${HERO_STROKE_PX.sm}`);
    expect(hero).toContain('vectorEffect="non-scaling-stroke"');
  });

  it("le tracé commence et finit sur la ligne de base : crête, creux, …, crête", () => {
    const d = wavePath(x0, y, period, amplitude, count);
    expect(d.startsWith(`M${x0} ${y}q${period / 4} ${-2 * amplitude} ${period / 2} 0`)).toBe(true);
    expect(d.match(/ t/g)).toHaveLength(count - 1);
    expect(count % 2).toBe(1);
  });

  it("l'étoile, au bout de la vague, tient dans le viewBox sans toucher le trait", () => {
    const pts = astrePoints(ASTRE).map(([px, py]) => [
      HERO_STAR.cx + (px - ASTRE_CENTER[0]) * HERO_STAR.scale,
      HERO_STAR.cy + (py - ASTRE_CENTER[1]) * HERO_STAR.scale,
    ]);
    expect(pts).toHaveLength(8);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    expect(Math.min(...xs)).toBeGreaterThan(x0 + (count * period) / 2);
    expect(Math.max(...xs)).toBeLessThanOrEqual(HERO_VIEWBOX.width);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThan(y - amplitude);
  });

  it("vague et étoile en jaune --sun, décoratives, masquées en couleurs forcées, largeur bornée", () => {
    expect(hero.match(/stroke-sun|fill-sun/g)).toHaveLength(2);
    expect(hero).toContain("aria-hidden");
    expect(hero).toContain("forced-colors:hidden");
    expect(hero).toMatch(/w-\[65%\] max-w-md/);
  });

  it("une seule étoile ajoutée : l'astre n'est dessiné que par le logo et par le hero", () => {
    const users = (readdirSync(src, { recursive: true }) as string[])
      .filter((f) => /\.tsx?$/.test(f))
      .filter((f) => /\{ASTRE\}/.test(readFileSync(path.join(src, f), "utf8")))
      .map((f) => f.replaceAll(path.sep, "/"))
      .sort();
    expect(users).toEqual(["components/hero-wave.tsx", "components/logo.tsx"]);
  });
});

describe("exemples du hero en pastilles", () => {
  it("liste <ul> nommée par « Essayez : », sans points médians", () => {
    expect(home).toMatch(/<ul aria-labelledby="hero-examples"/);
    expect(home).toMatch(/<p id="hero-examples"/);
    expect(home).toContain('className="example-chip"');
    expect(home).not.toContain("·");
  });

  it("pastille : pilule teintée, texte bleu foncé lisible en clair comme en sombre", () => {
    const rule = css.match(/\.example-chip \{([\s\S]*?)\}/)?.[1] ?? "";
    expect(rule).toContain("background-color: var(--tint);");
    expect(rule).toContain("color: var(--link);");
    expect(rule).toContain("border-radius: 9999px;");
    expect(contrast("#3E54B8", "#EAEDF9")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#2E3F8C", "#EAEDF9")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#8FA1EA", "#20284A")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#A3B2EF", "#20284A")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("pied de page bleu (section forte)", () => {
  const surface = css.match(/^\.surface-brand \{([\s\S]*?)^\}/m)?.[1] ?? "";

  it("surface bleue : texte, liens et focus clairs au contraste AA, en clair comme en sombre", () => {
    expect(css).toMatch(/:root \{[\s\S]*?--brand-surface: #3E54B8;/);
    expect(css).toMatch(/\.dark \{[\s\S]*?--brand-surface: #27346F;/);
    for (const bg of ["#3E54B8", "#27346F"]) {
      expect(contrast("#EEF1FB", bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast("#FFFFFF", bg)).toBeGreaterThanOrEqual(4.5);
    }
    expect(surface).toContain("--ring: #FFFFFF;");
    expect(surface).toContain("--link-hover: #FFFFFF;");
  });

  it("logo lisible sur le bleu : bleu de marque éclairci, cadre en couleur claire, astre jaune", () => {
    const brand = surface.match(/--brand: (#[0-9A-F]{6});/i)?.[1] ?? "";
    for (const bg of ["#3E54B8", "#27346F"]) {
      expect(contrast(brand, bg)).toBeGreaterThanOrEqual(3);
      expect(contrast("#D7A848", bg)).toBeGreaterThanOrEqual(3);
    }
    expect(footer).toContain('<LogoMark className="size-6 text-brand-foreground" />');
    expect(css).toMatch(/@media \(forced-colors: active\) \{\s*\.surface-brand \{\s*--brand: CanvasText;\s*--brand-foreground: CanvasText;/);
  });

  it("vague en trait épais comme liseré supérieur : continue, décorative, remplacée par un filet en couleurs forcées", () => {
    expect(footer).toContain('className="surface-brand forced-colors:border-t"');
    expect(footer).toMatch(/preserveAspectRatio="xMidYMax slice"/);
    expect(footer).toContain("aria-hidden");
    expect(footer).toContain("forced-colors:hidden");
    expect(footer).toContain('strokeLinecap="round"');
    // La crête, trait compris, tient dans la hauteur du liseré.
    const { y, amplitude, stroke, height } = FOOTER_WAVE;
    expect(y - amplitude - stroke / 2).toBeGreaterThanOrEqual(0);
    expect(y + amplitude + stroke / 2).toBeLessThanOrEqual(height);
  });

  it("liens clairs soulignés au survol, sans nouveau texte", () => {
    expect(footer.match(/className="footer-link"/g)).toHaveLength(2);
    expect(css).toMatch(/\.footer-link:hover \{\s*color: var\(--link-hover\);\s*text-decoration-color: currentColor;/);
    for (const label of ["À propos", "Bugs et idées", "Mentions légales", "Conditions d'utilisation", "Confidentialité", "Données OpenAlex"]) {
      expect(footer).toContain(label);
    }
  });
});
