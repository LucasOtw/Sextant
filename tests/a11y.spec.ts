import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Banc d'accessibilité (QUAL-43), lancé par `npm run test:a11y` contre un aperçu Vercel ou le serveur de dev.
 * Pour chaque page publique, en clair et en sombre :
 * - axe (WCAG 2.1 A/AA et bonnes pratiques) : échec sur tout impact serious ou critical, et explicitement sur
 *   page-has-heading-one, landmark-one-main et region (impact moderate, mais ce sont les régressions de l'audit) ;
 * - à 320 px de large, aucun débordement horizontal (scrollWidth <= clientWidth).
 * Les pages lisent la base de production : toute requête autre que GET/HEAD est bloquée.
 */

const PAGES = [
  { name: "accueil", path: "/" },
  { name: "recherche", path: "/search?q=climat" },
  { name: "fiche article", path: "/article/W2741809807" },
  { name: "thème", path: "/theme/informatique" },
  { name: "retours", path: "/retours" },
  { name: "à propos", path: "/a-propos" },
  { name: "mentions légales", path: "/mentions-legales" },
  { name: "confidentialité", path: "/confidentialite" },
  { name: "conditions", path: "/conditions" },
];

const SCHEMES = ["light", "dark"] as const;

/** Règles d'impact moderate qui font échouer quand même : h1 manquant, pas de <main>, contenu hors des repères. */
const ALWAYS_FAIL = new Set(["page-has-heading-one", "landmark-one-main", "region"]);

/** Aperçus Vercel protégés : jeton « Protection Bypass for Automation », envoyé au seul site testé. */
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

async function guard(page: Page, baseURL: string): Promise<void> {
  const origin = new URL(baseURL).origin;
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() !== "GET" && request.method() !== "HEAD") return route.abort("blockedbyclient");
    if (BYPASS && new URL(request.url()).origin === origin) {
      return route.continue({ headers: { ...request.headers(), "x-vercel-protection-bypass": BYPASS } });
    }
    return route.continue();
  });
}

async function open(page: Page, path: string): Promise<void> {
  const response = await page.goto(path, { waitUntil: "load" });
  expect(response?.status(), `statut HTTP de ${path}`).toBeLessThan(400);
  // Laisser se terminer les chargements différés (sans échouer si une requête reste ouverte).
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
}

for (const { name, path } of PAGES) {
  for (const scheme of SCHEMES) {
    test.describe(`${name} (${scheme === "light" ? "clair" : "sombre"})`, () => {
      test.use({ colorScheme: scheme });

      test("axe : aucune violation grave, h1, <main> et repères présents", async ({ page, baseURL }) => {
        await guard(page, baseURL!);
        await open(page, path);
        const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
        const blocking = violations.filter((v) => v.impact === "serious" || v.impact === "critical" || ALWAYS_FAIL.has(v.id));
        const report = blocking.map((v) => `${v.id} (${v.impact}) : ${v.help}\n  ${v.nodes.slice(0, 5).map((n) => n.target.join(" ")).join("\n  ")}`);
        expect(report, report.join("\n")).toEqual([]);
      });

      test("aucun débordement horizontal à 320 px", async ({ page, baseURL }) => {
        await guard(page, baseURL!);
        await page.setViewportSize({ width: 320, height: 800 });
        await open(page, path);
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(scrollWidth, `largeur de ${path} à 320 px`).toBeLessThanOrEqual(clientWidth);
      });
    });
  }
}
