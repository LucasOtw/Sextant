// @vitest-environment happy-dom
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HighlightsProvider, useHighlights } from "@/components/highlights/highlights-provider";
import { SentencePickerDialog } from "@/components/highlights/sentence-picker-dialog";
import { pageAtTop, parsePickerPage } from "@/lib/pdf-pages";
import { passagesSavedToast, splitSentences, type Sentence } from "@/lib/sentences";
import { makeSnapshot } from "../fixtures";

const sonner = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: sonner.success, error: sonner.error }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  vi.unstubAllGlobals();
  sonner.success.mockReset();
  sonner.error.mockReset();
  document.body.innerHTML = "";
});

async function render(node: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  return host;
}

describe("choix de phrases : un seul toast pour le lot", () => {
  it("passagesSavedToast : singulier ou pluriel", () => {
    expect(passagesSavedToast(1)[0]).toBe("Passage surligné.");
    expect(passagesSavedToast(3)).toEqual(["3 passages surlignés.", { description: "Retrouvez-les dans « Mes citations », avec leur source." }]);
  });

  it("addMany : deux passages enregistrés, un seul toast « 2 passages surlignés. »", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === "POST"
          ? Response.json({ highlight: { id: `h${++n}`, text: JSON.parse(String(init.body)).text } })
          : Response.json({ highlights: [] }),
      ),
    );
    let result: boolean | null = null;
    function Consumer() {
      const { addMany } = useHighlights();
      useEffect(() => {
        void addMany([
          { source: "abstract", text: "Un.", prefix: "", suffix: "", page: null, note: "" },
          { source: "abstract", text: "Trois.", prefix: "", suffix: "", page: null, note: "" },
        ]).then((ok) => (result = ok));
      }, [addMany]);
      return null;
    }
    const props = { enabled: true, snapshot: makeSnapshot(), initial: [] } as unknown as React.ComponentProps<typeof HighlightsProvider>;
    await render(createElement(HighlightsProvider, props, createElement(Consumer)));
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(result).toBe(true);
    expect(sonner.success).toHaveBeenCalledOnce();
    expect(sonner.success.mock.calls[0][0]).toBe("2 passages surlignés.");
  });
});

describe("SentencePickerDialog : échec d'enregistrement dit dans la fenêtre (plein écran natif)", () => {
  it("onSave renvoie false : message role=alert dans la fenêtre, qui reste ouverte", async () => {
    const sentences: Sentence[] = splitSentences("Première phrase. Deuxième phrase.");
    const onOpenChange = vi.fn();
    await render(
      createElement(SentencePickerDialog, {
        open: true,
        onOpenChange,
        title: "Surligner des phrases",
        description: "Cochez les phrases.",
        sentences,
        isHighlighted: () => false,
        onSave: async () => false,
      }),
    );
    const box = document.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    await act(async () => box.click());
    const submit = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Surligner (1)"))!;
    await act(async () => submit.click());
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("La phrase n'a pas pu être surlignée. Réessayez.");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe("pageAtTop : page de départ du choix de phrases", () => {
  function pages(bottoms: number[]): HTMLElement[] {
    return bottoms.map((bottom, i) => {
      const el = document.createElement("div");
      el.dataset.page = String(i + 1);
      el.getBoundingClientRect = () => ({ bottom }) as DOMRect;
      return el;
    });
  }

  it("première page dont le bas passe sous l'en-tête ; dernière page si toutes sont au-dessus ; 1 sans page", () => {
    const bottoms = Array.from({ length: 220 }, (_, i) => (i + 1) * 800 - 150 * 800 + 500);
    expect(pageAtTop(pages(bottoms))).toBe(150);
    expect(pageAtTop(pages([500, 1300, 2100]))).toBe(1);
    expect(pageAtTop(pages([-900, -100, 50]))).toBe(3);
    expect(pageAtTop([])).toBe(1);
  });
});

describe("parsePickerPage : champ « Page » du choix de phrases", () => {
  it("page existante acceptée ; vide, texte ou hors bornes : message au lieu des phrases d'une autre page", () => {
    expect(parsePickerPage("9", 15)).toEqual({ page: 9 });
    expect(parsePickerPage("99", 15)).toEqual({ error: "La page doit être comprise entre 1 et 15." });
    expect(parsePickerPage("0", 15)).toEqual({ error: "La page doit être comprise entre 1 et 15." });
    expect(parsePickerPage("2.5", 15)).toEqual({ error: "La page doit être comprise entre 1 et 15." });
    expect(parsePickerPage("", 15)).toEqual({ error: "Indiquez un numéro de page, entre 1 et 15." });
    expect(parsePickerPage("  ", 15)).toEqual({ error: "Indiquez un numéro de page, entre 1 et 15." });
  });
});
