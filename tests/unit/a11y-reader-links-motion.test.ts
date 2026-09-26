// @vitest-environment happy-dom
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inertOutside } from "@/lib/focus";
import { voteLabel } from "@/lib/labels";

afterEach(() => {
  document.body.innerHTML = "";
});

/** Squelette de /article/[id]/lire : lien d'évitement, en-tête, contenu (barre + lecteur), pied, toasts, annonces. */
function readerPage() {
  document.body.innerHTML = `
    <a href="#contenu">Aller au contenu</a>
    <header><a href="/">Sextant</a></header>
    <main id="contenu">
      <div class="page">
        <div class="bar"><a href="/article/W1">Fiche article</a></div>
        <div class="wrap"><button>Quitter le plein écran</button></div>
      </div>
    </main>
    <footer><a href="/confidentialite">Confidentialité</a></footer>
    <section aria-label="Notifications"><button>Annuler</button></section>
    <div id="annonces" aria-live="polite"></div>`;
  const $ = (s: string) => document.querySelector(s)!;
  return { skip: $("body > a"), header: $("header"), main: $("main"), page: $(".page"), bar: $(".bar"), wrap: $(".wrap"), footer: $("footer"), toasts: $("section"), live: $("#annonces") };
}

describe("lecteur en plein écran : le reste de la page est inerte (A11Y-29)", () => {
  it("en-tête, pied, lien d'évitement et barre de la page deviennent inertes ; le lecteur et ses ancêtres non", () => {
    const p = readerPage();
    inertOutside(p.wrap);
    for (const el of [p.skip, p.header, p.footer, p.bar]) expect(el.hasAttribute("inert")).toBe(true);
    for (const el of [p.wrap, p.page, p.main]) expect(el.hasAttribute("inert")).toBe(false);
  });

  it("les toasts (« Annuler ») et la région d'annonce restent actifs", () => {
    const p = readerPage();
    inertOutside(p.wrap);
    expect(p.toasts.hasAttribute("inert")).toBe(false);
    expect(p.live.hasAttribute("inert")).toBe(false);
  });

  it("la sortie rétablit tout, sans toucher à ce qui était déjà inerte", () => {
    const p = readerPage();
    p.footer.setAttribute("inert", "");
    const restore = inertOutside(p.wrap);
    restore();
    for (const el of [p.skip, p.header, p.bar]) expect(el.hasAttribute("inert")).toBe(false);
    expect(p.footer.hasAttribute("inert")).toBe(true);
  });
});

describe("vote d'un retour : nom fixe, l'état passe par aria-pressed (A11Y-30)", () => {
  it("même nom avant et après le vote, pluriel juste, espaces normalisés", () => {
    expect(voteLabel("Export  RIS\n", 1)).toBe("Voter : Export RIS (1 vote)");
    expect(voteLabel("Export RIS", 0)).toBe("Voter : Export RIS (0 vote)");
    expect(voteLabel("Export RIS", 12)).toBe("Voter : Export RIS (12 votes)");
  });
});

/** Fichiers .tsx de src/, avec leur contenu. */
function sources(): { file: string; text: string }[] {
  const root = path.resolve(__dirname, "../../src");
  return (readdirSync(root, { recursive: true }) as string[])
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => ({ file: f, text: readFileSync(path.join(root, f), "utf8") }));
}

describe("liens qui ouvrent un nouvel onglet (A11Y-35)", () => {
  it("passent par ExternalLink, ou leur texte le dit déjà", () => {
    const offenders: string[] = [];
    for (const { file, text } of sources()) {
      if (file.endsWith("external-link.tsx")) continue;
      for (const m of text.matchAll(/<a\b[^>]*target="_blank"/g)) {
        // Le lien et la fin de sa phrase : « … </a> dans un nouvel onglet. » compte aussi.
        const end = text.indexOf("</a>", m.index);
        const around = text.slice(m.index, end + 40);
        if (!/nouvel onglet/.test(around)) offenders.push(`${file}:${text.slice(0, m.index).split("\n").length}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("mouvement réduit (A11Y-32)", () => {
  it("les primitives animées s'arrêtent sous prefers-reduced-motion", () => {
    const offenders: string[] = [];
    for (const { file, text } of sources()) {
      for (const m of text.matchAll(/"[^"\n]*\banimate-in\b[^"\n]*"/g)) {
        if (!/motion-reduce:animate-none/.test(m[0])) offenders.push(`${file}:${text.slice(0, m.index).split("\n").length}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("soulèvement au survol et points qui rebondissent seulement sans préférence de mouvement réduit", () => {
    const offenders: string[] = [];
    for (const { file, text } of sources()) {
      for (const m of text.matchAll(/(\S*)(hover:-translate-y|animate-bounce)/g)) {
        if (!m[1].includes("motion-safe:")) offenders.push(`${file}:${text.slice(0, m.index).split("\n").length}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
