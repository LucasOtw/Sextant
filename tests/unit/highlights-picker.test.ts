// @vitest-environment happy-dom
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HighlightsProvider, useHighlights } from "@/components/highlights/highlights-provider";
import { SentencePickerDialog } from "@/components/highlights/sentence-picker-dialog";
import { pageAtTop, parsePickerPage } from "@/lib/pdf-pages";
import { MAX_HIGHLIGHT_TEXT } from "@/lib/highlights-shared";
import { passagesFrom, passagesSavedToast, splitSentences, type Sentence } from "@/lib/sentences";
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
    let result: { ok: boolean; error?: string } | null = null;
    function Consumer() {
      const { addMany } = useHighlights();
      useEffect(() => {
        void addMany([
          { source: "abstract", text: "Un.", prefix: "", suffix: "", page: null, note: "" },
          { source: "abstract", text: "Trois.", prefix: "", suffix: "", page: null, note: "" },
        ]).then((r) => (result = r));
      }, [addMany]);
      return null;
    }
    const props = { enabled: true, snapshot: makeSnapshot(), initial: [] } as unknown as React.ComponentProps<typeof HighlightsProvider>;
    await render(createElement(HighlightsProvider, props, createElement(Consumer)));
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(result).toEqual({ ok: true });
    expect(sonner.success).toHaveBeenCalledOnce();
    expect(sonner.success.mock.calls[0][0]).toBe("2 passages surlignés.");
  });

  it("addMany : passage trop long refusé, raison renvoyée à la fenêtre (sans toast d'erreur, invisible en plein écran)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => (init?.method === "POST" ? Response.json({ highlight: { id: "h1", text: "Un." } }) : Response.json({ highlights: [] }))),
    );
    let result: { ok: boolean; error?: string } | null = null;
    function Consumer() {
      const { addMany } = useHighlights();
      useEffect(() => {
        void addMany([
          { source: "pdf", text: "Un.", prefix: "", suffix: "", page: 3, note: "" },
          { source: "pdf", text: "x".repeat(MAX_HIGHLIGHT_TEXT + 1), prefix: "", suffix: "", page: 3, note: "" },
        ]).then((r) => (result = r));
      }, [addMany]);
      return null;
    }
    const props = { enabled: true, snapshot: makeSnapshot(), initial: [] } as unknown as React.ComponentProps<typeof HighlightsProvider>;
    await render(createElement(HighlightsProvider, props, createElement(Consumer)));
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining(`Passage trop long : ${MAX_HIGHLIGHT_TEXT} caractères au plus.`) });
    expect(sonner.error).not.toHaveBeenCalled();
    expect(sonner.success.mock.calls[0][0]).toBe("Passage surligné.");
  });

  it("passagesFrom : toutes les phrases d'une page dense cochées donnent des passages sous la limite, coupés entre deux phrases", () => {
    const sentence = `Le ${"mot ".repeat(59).trim()}.`; // 239 caractères
    const full = Array.from({ length: 40 }, () => sentence).join(" ");
    const sentences = splitSentences(full);
    expect(sentences).toHaveLength(40);
    const passages = passagesFrom(full, sentences, sentences.map((_, i) => i));
    expect(passages.length).toBeGreaterThan(1);
    for (const p of passages) {
      expect(Array.from(p.text).length).toBeLessThanOrEqual(MAX_HIGHLIGHT_TEXT);
      expect(p.text.endsWith(".")).toBe(true);
    }
    // Rien de perdu : les passages mis bout à bout redonnent le texte.
    expect(passages.map((p) => p.text).join(" ")).toBe(full);
    // Une phrase plus longue que la limite à elle seule reste un passage (refusé à l'enregistrement, raison dite).
    const huge = `${"a".repeat(MAX_HIGHLIGHT_TEXT + 10)}.`;
    expect(passagesFrom(huge, splitSentences(huge), [0])).toHaveLength(1);
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
        onSave: async () => ({ ok: false }),
      }),
    );
    const box = document.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    await act(async () => box.click());
    const submit = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Surligner (1)"))!;
    await act(async () => submit.click());
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("La phrase n'a pas pu être surlignée. Réessayez.");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("raison connue (passage trop long) : dite dans la fenêtre au lieu de « Réessayez »", async () => {
    const sentences: Sentence[] = splitSentences("Première phrase. Deuxième phrase.");
    await render(
      createElement(SentencePickerDialog, {
        open: true,
        onOpenChange: vi.fn(),
        title: "Surligner des phrases",
        description: "Cochez les phrases.",
        sentences,
        isHighlighted: () => false,
        onSave: async () => ({ ok: false, error: "Passage trop long : 3000 caractères au plus." }),
      }),
    );
    for (const box of document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) await act(async () => box.click());
    const submit = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Surligner (2)"))!;
    await act(async () => submit.click());
    const alert = document.querySelector('[role="alert"]')?.textContent;
    expect(alert).toBe("Certaines phrases n'ont pas pu être surlignées. Passage trop long : 3000 caractères au plus.");
    expect(alert).not.toContain("Réessayez");
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
