import { describe, expect, it } from "vitest";
import { HTML_LIMITED_BOT_UA_RE } from "next/dist/shared/lib/router/utils/html-bots";
import { HTML_LIMITED_BOTS, NEXT_HTML_LIMITED_BOTS } from "@/lib/html-bots";
import { articleMetaDescription, metaDescription } from "@/lib/format";
import { sitemapEntries } from "@/lib/sitemap";
import { SITE } from "@/lib/site";
import { THEMES, themeMetaDescription } from "@/lib/themes";
import robots from "@/app/robots";
import { makeWork } from "../fixtures";

const UA = {
  googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  googlebotMobile: "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  inspection: "Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)",
  twitter: "Twitterbot/1.0",
  chrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  safari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
};

describe("robots servis en rendu bloquant (QUAL-16)", () => {
  it("la copie de la liste de Next est à jour : sinon, reporter la nouvelle liste dans lib/html-bots.ts", () => {
    expect(NEXT_HTML_LIMITED_BOTS).toBe(HTML_LIMITED_BOT_UA_RE.source);
  });

  it("Googlebot s'ajoute à la liste de Next sans en retirer un robot", () => {
    for (const ua of [UA.googlebot, UA.googlebotMobile, UA.inspection, UA.twitter]) expect(HTML_LIMITED_BOTS.test(ua), ua).toBe(true);
  });

  it("les navigateurs gardent le rendu en flux", () => {
    for (const ua of [UA.chrome, UA.safari]) expect(HTML_LIMITED_BOTS.test(ua), ua).toBe(false);
  });
});

describe("metaDescription", () => {
  it("rend tel quel un texte court, espaces réduits", () => {
    expect(metaDescription("  Un   résumé\ncourt. ")).toBe("Un résumé court.");
  });

  it("coupe au dernier espace avant la limite, « … » compris dans la limite", () => {
    const text = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(6);
    const out = metaDescription(text, 60);
    expect(Array.from(out).length).toBeLessThanOrEqual(60);
    expect(out.endsWith("…")).toBe(true);
    expect(text.replace(/\s+/g, " ").startsWith(out.slice(0, -1))).toBe(true);
    // Ni mot coupé ni ponctuation pendante avant les points de suspension.
    expect(out).toBe("Lorem ipsum dolor sit amet, consectetur adipiscing elit…");
  });

  it("coupe net un mot unique trop long", () => {
    expect(metaDescription("x".repeat(200), 10)).toBe(`${"x".repeat(9)}…`);
  });
});

describe("articleMetaDescription", () => {
  it("début du résumé quand il existe", () => {
    expect(articleMetaDescription(makeWork(), "Nous étudions l'avantage de citation des articles en accès ouvert.")).toBe(
      "Nous étudions l'avantage de citation des articles en accès ouvert.",
    );
  });

  it("sans résumé : type, auteurs, revue et année, au lieu de la description du site", () => {
    expect(articleMetaDescription(makeWork(), null)).toBe("Article de Heather Piwowar et Jason Priem. PeerJ, 2018.");
    expect(articleMetaDescription(makeWork({ type: "dissertation", primary_location: null, publication_year: null }), "  ")).toBe(
      "Thèse de Heather Piwowar et Jason Priem.",
    );
    expect(articleMetaDescription(makeWork({ type: "other", authorships: [] }), null)).toBe("Publication. PeerJ, 2018.");
  });
});

describe("pages de thème (QUAL-18)", () => {
  it("chaque thème a sa propre description, sous 160 caractères", () => {
    const all = THEMES.map(themeMetaDescription);
    expect(new Set(all).size).toBe(THEMES.length);
    for (const d of all) expect(d.length).toBeLessThanOrEqual(160);
  });
});

describe("robots.txt et sitemap.xml (QUAL-17)", () => {
  it("robots.txt : recherche, API et pages d'aide Firebase exclues ; adresse du plan du site", () => {
    const r = robots();
    expect(r.sitemap).toBe(`${SITE.url}/sitemap.xml`);
    expect(r.rules).toMatchObject({ userAgent: "*", allow: "/", disallow: ["/api/", "/search", "/__/auth/"] });
  });

  it("plan du site : accueil, thèmes, pages légales, articles donnés (dédoublonnés), adresses absolues", () => {
    const urls = sitemapEntries(["https://openalex.org/W1", "W2", "https://openalex.org/W1"]).map((e) => e.url);
    expect(urls).toContain(`${SITE.url}/`);
    for (const t of THEMES) expect(urls).toContain(`${SITE.url}/theme/${t.slug}`);
    for (const p of ["/a-propos", "/conditions", "/confidentialite", "/mentions-legales", "/retours"]) expect(urls).toContain(`${SITE.url}${p}`);
    expect(urls.filter((u) => u.includes("/article/"))).toEqual([`${SITE.url}/article/W1`, `${SITE.url}/article/W2`]);
    expect(urls.every((u) => u.startsWith("https://"))).toBe(true);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("plan du site : jamais de page personnelle, de liste partagée ni de recherche", () => {
    const urls = sitemapEntries([]).map((e) => e.url);
    expect(urls.filter((u) => /\/(favoris|citations|compte|liste|search|api)\b/.test(u))).toEqual([]);
  });
});
