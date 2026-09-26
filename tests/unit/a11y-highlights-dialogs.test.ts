// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArticleHighlights } from "@/components/highlights/article-highlights";
import { HighlightItem } from "@/components/highlights/highlight-item";
import { HighlightsProvider } from "@/components/highlights/highlights-provider";
import { SentencePickerDialog } from "@/components/highlights/sentence-picker-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { Highlight } from "@/lib/highlights-shared";
import { pendingIndexes, splitSentences, type Sentence } from "@/lib/sentences";
import { makeSnapshot } from "../fixtures";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

async function render(node: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  return host;
}

function highlight(overrides: Partial<Highlight> = {}): Highlight {
  return { id: "h1", workId: "W1", text: "Open science matters.", note: "", page: null, source: "abstract", prefix: "", suffix: "", article: makeSnapshot(), createdAt: null, ...overrides } as unknown as Highlight;
}

const button = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(label));

describe("pendingIndexes : pas de doublon après un enregistrement partiel", () => {
  const sentences = splitSentences("Un. Deux. Trois. Quatre.");
  it("écarte les phrases déjà retenues, les indices hors liste et les doublons ; ordre croissant", () => {
    const done = new Set(["Deux."]);
    expect(pendingIndexes([3, 1, 0, 9, -1, 0], sentences, (s) => done.has(s.text))).toEqual([0, 3]);
  });
  it("tout est déjà retenu : rien à envoyer", () => {
    expect(pendingIndexes([0, 1], sentences, () => true)).toEqual([]);
  });
});

describe("DialogContent monté dans l'élément en plein écran", () => {
  it("container fourni : la fenêtre est rendue dans cet élément, pas à la racine de <body>", async () => {
    const wrap = document.createElement("div");
    document.body.appendChild(wrap);
    await render(createElement(Dialog, { open: true }, createElement(DialogContent, { container: wrap }, createElement(DialogTitle, null, "Titre"))));
    const popup = document.querySelector('[data-slot="dialog-content"]');
    expect(popup).not.toBeNull();
    expect(wrap.contains(popup)).toBe(true);
  });
});

describe("SentencePickerDialog : enregistrement partiel", () => {
  it("un second « Surligner » n'envoie que les phrases pas encore retenues", async () => {
    const sentences: Sentence[] = splitSentences("Première phrase. Deuxième phrase. Troisième phrase.");
    const saved = new Set<string>();
    const onSave = vi.fn(async (indexes: number[]) => {
      // Premier essai : la première phrase passe, la suivante est refusée (passage trop long, 429, réseau…).
      if (onSave.mock.calls.length === 1) {
        saved.add(sentences[indexes[0]].text);
        return { ok: false };
      }
      return { ok: true };
    });
    await render(
      createElement(SentencePickerDialog, {
        open: true,
        onOpenChange: () => undefined,
        title: "Surligner des phrases",
        description: "Cochez les phrases.",
        sentences,
        isHighlighted: (s: Sentence) => saved.has(s.text),
        onSave,
      }),
    );
    const boxes = () => [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    await act(async () => boxes()[0].click());
    await act(async () => boxes()[2].click());
    await act(async () => button("Surligner (2)")!.click());
    expect(onSave).toHaveBeenNthCalledWith(1, [0, 2]);
    // La phrase enregistrée est cochée et inactive ; le bouton ne compte plus que l'autre.
    expect(boxes()[0].disabled).toBe(true);
    await act(async () => button("Surligner (1)")!.click());
    expect(onSave).toHaveBeenNthCalledWith(2, [2]);
  });
});

describe("« Mes surlignages » : boutons d'ajout stables au premier surlignage", () => {
  it("le bouton déclencheur reste le même nœud quand la liste apparaît : le focus peut lui revenir", async () => {
    let resolve: (value: Response) => void = () => undefined;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => (resolve = r))));
    await render(
      createElement(
        HighlightsProvider,
        // Les enfants passent en troisième argument ; le type de Props les exige aussi dans l'objet.
        { enabled: true, snapshot: makeSnapshot(), initial: [] } as unknown as React.ComponentProps<typeof HighlightsProvider>,
        createElement(ArticleHighlights, { abstract: "Open science matters. It helps.", lang: "en" }),
      ),
    );
    const manual = button("Ajouter une citation à la main")!;
    const picker = button("Surligner des phrases du résumé")!;
    expect(document.body.textContent).toContain("Aucun passage retenu");
    // La relecture serveur apporte un premier passage : la liste remplace l'état vide.
    await act(async () => resolve(new Response(JSON.stringify({ highlights: [highlight()] }), { status: 200 })));
    expect(document.querySelectorAll("blockquote")).toHaveLength(1);
    expect(document.body.textContent).not.toContain("Aucun passage retenu");
    expect(manual.isConnected).toBe(true);
    expect(picker.isConnected).toBe(true);
    expect(button("Ajouter une citation à la main")).toBe(manual);
  });
});

describe("HighlightItem : langue du passage et clic sur la note", () => {
  const props = { onNote: async () => true, onDelete: async () => true };

  it("lang posé sur un passage du résumé ou du PDF, pas sur une citation saisie à la main", async () => {
    const host = await render(
      createElement(
        "ul",
        null,
        createElement(HighlightItem, { ...props, key: "a", highlight: highlight(), lang: "en" }),
        createElement(HighlightItem, { ...props, key: "p", highlight: highlight({ id: "h2", source: "pdf", page: 3 }), lang: "en" }),
        createElement(HighlightItem, { ...props, key: "m", highlight: highlight({ id: "h3", source: "manual" }), lang: "en" }),
      ),
    );
    expect([...host.querySelectorAll("blockquote")].map((b) => b.getAttribute("lang"))).toEqual(["en", "en", null]);
  });

  it("un clic sur le texte de la note ouvre son édition (raccourci souris), sans en faire un contrôle", async () => {
    const host = await render(createElement("ul", null, createElement(HighlightItem, { ...props, highlight: highlight({ note: "À relire" }) })));
    const note = [...host.querySelectorAll("p")].find((p) => p.textContent?.includes("À relire"))!;
    expect(note.hasAttribute("role")).toBe(false);
    expect(note.hasAttribute("tabindex")).toBe(false);
    await act(async () => note.click());
    expect(host.querySelector("textarea")).not.toBeNull();
  });
});
