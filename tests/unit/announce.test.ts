// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { announce, ANNOUNCER_ID, copyText } from "@/lib/announce";

describe("announce (région d'annonce, A11Y-12 / A11Y-13)", () => {
  let region: HTMLElement;
  beforeEach(() => {
    vi.useFakeTimers();
    region = document.createElement("div");
    region.id = ANNOUNCER_ID;
    region.setAttribute("aria-live", "polite");
    document.body.appendChild(region);
  });
  afterEach(() => {
    region.remove();
    vi.useRealTimers();
  });

  it("vide la région puis écrit le message : un message identique est relu", () => {
    announce("Copié.");
    vi.advanceTimersByTime(200);
    expect(region.textContent).toBe("Copié.");
    announce("Copié.");
    expect(region.textContent).toBe("");
    vi.advanceTimersByTime(200);
    expect(region.textContent).toBe("Copié.");
  });

  it("deux annonces rapprochées : seule la dernière est écrite", () => {
    announce("Premier");
    announce("Second");
    vi.advanceTimersByTime(200);
    expect(region.textContent).toBe("Second");
  });

  it("sans région : aucune erreur", () => {
    region.remove();
    expect(() => announce("x")).not.toThrow();
  });

  it("copyText : copie puis annonce ; presse-papiers indisponible → false, rien d'annoncé", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(copyText("abc", "Lien copié.")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("abc");
    vi.advanceTimersByTime(200);
    expect(region.textContent).toBe("Lien copié.");

    region.textContent = "";
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("refus")) } });
    await expect(copyText("abc")).resolves.toBe(false);
    vi.stubGlobal("navigator", {});
    await expect(copyText("abc")).resolves.toBe(false);
    vi.advanceTimersByTime(200);
    expect(region.textContent).toBe("");
  });
});
