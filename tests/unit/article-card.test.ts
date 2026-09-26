import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArticleBadges, ArticleMeta, ArticleTitle, CitationCount } from "@/components/article-card";
import { EmptyState } from "@/components/empty-state";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe("blocs communs des cartes d'article (QUAL-13)", () => {
  it("badges : type, accès ouvert, rétractation et sujet seulement s'ils s'appliquent", () => {
    const all = html(createElement(ArticleBadges, { type: "dissertation", isOa: true, retracted: true, topic: "Écologie" }));
    expect(all).toContain("Thèse");
    expect(all).toContain("Accès ouvert");
    expect(all).toContain("Rétracté");
    expect(all).toContain("· Écologie");
    const bare = html(createElement(ArticleBadges, { type: "article", isOa: false, topic: null }));
    expect(bare).not.toMatch(/Accès ouvert|Rétracté|·/);
  });

  it("titre : lien étiré, niveau demandé, interligne gardé quand on le redonne après la taille", () => {
    /* eslint-disable react/no-children-prop -- createElement typé : `children` est une prop requise d'ArticleTitle. */
    const h2 = html(createElement(ArticleTitle, { href: "/article/W1", as: "h2", className: "text-xl leading-snug", children: "Titre" }));
    expect(h2).toMatch(/^<h2 class="title-display text-xl leading-snug"><a class="card-title after:absolute after:inset-0 hover:text-link" href="\/article\/W1">Titre<\/a><\/h2>$/);
    expect(html(createElement(ArticleTitle, { href: "/article/W1", children: "T" }))).toMatch(/^<h3 /);
    /* eslint-enable react/no-children-prop */
  });

  it("métadonnées : « Auteurs · Revue · Année », langue seulement si ce n'est pas l'anglais", () => {
    const meta = html(createElement(ArticleMeta, { authors: "A et B", venue: "PeerJ", year: 2018, language: "fr" }));
    expect(meta.replace(/<[^>]+>/g, "")).toBe("A et B · PeerJ · 2018 · fr");
    expect(html(createElement(ArticleMeta, { authors: "A", venue: null, year: null, language: "en" })).replace(/<[^>]+>/g, "")).toBe("A");
  });

  it("nombre de citations accordé", () => {
    expect(html(createElement(CitationCount, { count: 1 })).replace(/<[^>]+>/g, "")).toBe("1 citation");
    expect(html(createElement(CitationCount, { count: 12000 })).replace(/<[^>]+>/g, "")).toMatch(/citations$/);
  });

  it("état vide : titre focalisable sur demande, icône, action, marges ajustables", () => {
    const out = html(createElement(EmptyState, { title: "Rien.", hint: "Explication.", titleRef: createRef<HTMLParagraphElement>(), focusableTitle: true, action: createElement("button", null, "Agir"), className: "p-8" }));
    expect(out).toContain('class="surface-tint rounded-2xl text-center p-8"');
    expect(out).toContain('<p tabindex="-1" class="title-display text-xl outline-none">Rien.</p>');
    expect(out).toContain('<p class="mx-auto mt-1 max-w-measure-text text-base text-muted-foreground">Explication.</p><button>Agir</button>');
    const withIcon = html(createElement(EmptyState, { title: "T", icon: createElement("svg") }));
    expect(withIcon).toContain('<svg></svg><p class="title-display text-xl mt-3">T</p>');
  });
});
