// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Retour du focus après « Annuler » ou la fermeture d'un toast (A11Y-19) : avec un autre toast encore affiché, Sonner
 * ne le rendait pas et il restait sur <body>.
 */
type Options = { action: { onClick: (e: unknown) => void }; onDismiss: () => void };
const sonner = vi.hoisted(() => ({ last: null as Options | null }));
vi.mock("sonner", () => ({
  toast: (_message: string, options: Options) => {
    sonner.last = options;
    return 1;
  },
}));

const { undoToast } = await import("@/lib/undo-toast");

/** Page : deux cœurs ; notifications : une liste Sonner avec le bouton « Annuler » et un second toast. */
function page() {
  document.body.innerHTML = `
    <main><button id="h1">Favori 1</button><button id="h2">Favori 2</button></main>
    <section><ol data-sonner-toaster tabindex="-1"><li><button id="undo">Annuler</button></li><li>Autre toast</li></ol></section>`;
  const byId = (id: string) => document.getElementById(id) as HTMLButtonElement;
  return { h1: byId("h1"), h2: byId("h2"), undo: byId("undo") };
}

const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

describe("undoToast : retour du focus", () => {
  beforeEach(() => {
    sonner.last = null;
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("« Annuler » : le bouton quitte le focus avant de disparaître, puis le focus revient au dernier élément de la page", async () => {
    const { h2, undo } = page();
    const onUndo = vi.fn(() => undo.closest("li")!.remove());
    undoToast("Retiré de vos favoris.", onUndo);
    h2.focus();
    undo.focus();
    const blurred = vi.fn();
    undo.addEventListener("blur", blurred);
    sonner.last!.action.onClick({});
    expect(blurred).toHaveBeenCalledOnce();
    expect(onUndo).toHaveBeenCalledOnce();
    await frame();
    expect(document.activeElement).toBe(h2);
  });

  it("cible donnée par l'appelant (l'article rétabli) prioritaire sur le repli", async () => {
    const { h1, h2, undo } = page();
    undoToast("Citation supprimée.", () => undo.remove(), undefined, () => h1);
    h2.focus();
    undo.focus();
    sonner.last!.action.onClick({});
    await frame();
    expect(document.activeElement).toBe(h1);
  });

  it("fermeture (croix) : même retour ; un focus déjà dans la page n'est pas déplacé", async () => {
    const { h1, h2, undo } = page();
    undoToast("Historique effacé.", () => {});
    h2.focus();
    // Sonner appelle onDismiss au clic sur la croix, avant de retirer le toast : le bouton a encore le focus.
    undo.focus();
    sonner.last!.onDismiss();
    undo.remove();
    await frame();
    expect(document.activeElement).toBe(h2);
    h1.focus();
    sonner.last!.onDismiss();
    await frame();
    expect(document.activeElement).toBe(h1);
  });

  it("clic sans focus (Safari, Firefox macOS, iOS) : focus resté sur <body>, aucun focus() appelé", async () => {
    const { h2, undo } = page();
    const field = document.createElement("input");
    document.querySelector("main")!.append(field);
    const onUndo = vi.fn(() => undo.closest("li")!.remove());
    undoToast("Retiré de vos favoris.", onUndo, undefined, () => h2);
    // Champ de filtre focalisé bien avant, puis quitté : il devient le repli.
    field.focus();
    field.blur();
    expect(document.activeElement).toBe(document.body);
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    sonner.last!.action.onClick({});
    sonner.last!.onDismiss();
    await frame();
    expect(onUndo).toHaveBeenCalledOnce();
    expect(focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);
    focus.mockRestore();
  });
});
