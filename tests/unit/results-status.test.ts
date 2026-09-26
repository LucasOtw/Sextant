// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Liste de résultats après la pagination ou « Réessayer » (A11Y-12) : le titre prend le focus sans annonce en plus ;
 * une demande de focus restée en suspens ne sert pas plus tard, à une autre liste.
 */
const announced = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock("@/lib/announce", () => ({ announce: (m: string) => announced.calls.push(m) }));
vi.mock("next/link", () => ({
  default: ({ href, onClick, children }: { href: string; onClick?: (e: unknown) => void; children?: React.ReactNode }) =>
    createElement("a", { href, onClick: (e: Event) => (e.preventDefault(), onClick?.(e)) }, children),
}));

const { ResultsLink, ResultsStatus, RESULTS_ID } = await import("@/components/results-status");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement;
beforeEach(() => {
  announced.calls = [];
  history.replaceState(null, "", "/search?q=climate");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.useRealTimers();
  document.body.innerHTML = "";
});

/** Clic sur un lien de pagination ; le lien disparaît avec l'ancienne liste (focus perdu), la nouvelle arrive. */
async function paginate(href: string, arrivedAt: string, message = "2 417 064 résultats pour « climate », page 2 sur 500.") {
  await act(async () => root!.render(createElement(ResultsLink, { href }, "Suivant")));
  const link = host.querySelector("a")!;
  link.focus();
  link.click();
  history.pushState(null, "", arrivedAt);
  await act(async () =>
    root!.render(createElement("div", null, createElement(ResultsStatus, { message }), createElement("h2", { id: RESULTS_ID, tabIndex: -1 }, "Résultats"))),
  );
}

describe("ResultsStatus", () => {
  it("après la pagination : focus sur le titre de la liste, sans annonce qui répéterait le nombre et la page", async () => {
    await paginate("/search?q=climate&page=2", "/search?q=climate&page=2");
    expect(document.activeElement?.id).toBe(RESULTS_ID);
    expect(announced.calls).toEqual([]);
  });

  it("filtre ou tri (pas de lien de liste) : annonce, focus inchangé", async () => {
    await act(async () => root!.render(createElement(ResultsStatus, { message: "12 résultats." })));
    expect(announced.calls).toEqual(["12 résultats."]);
  });

  it("liste d'une autre adresse que celle visée : la demande n'est pas utilisée (annonce, pas de focus)", async () => {
    await paginate("/search?q=climate&page=2", "/search?q=autre");
    expect(document.activeElement?.id).not.toBe(RESULTS_ID);
    expect(announced.calls).toHaveLength(1);
  });

  it("demande restée en suspens plus de 10 s : ignorée", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await act(async () => root!.render(createElement(ResultsLink, { href: "/search?q=climate&page=2" }, "Suivant")));
    host.querySelector("a")!.click();
    vi.setSystemTime(Date.now() + 11_000);
    history.pushState(null, "", "/search?q=climate&page=2");
    await act(async () =>
      root!.render(createElement("div", null, createElement(ResultsStatus, { message: "Page 2." }), createElement("h2", { id: RESULTS_ID, tabIndex: -1 }, "Résultats"))),
    );
    expect(document.activeElement?.id).not.toBe(RESULTS_ID);
    expect(announced.calls).toEqual(["Page 2."]);
  });
});
