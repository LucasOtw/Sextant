import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ToggleChip, toggleChip } from "@/components/ui/toggle-chip";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const classes = (markup: string) => (markup.match(/class="([^"]*)"/)?.[1] ?? "").split(" ");

describe("puce d'état sélectionné (C16, étape 17)", () => {
  it("active : teinte, bordure et texte bleu foncé en 700, jamais l'aplat du bouton plein", () => {
    const on = html(createElement(ToggleChip, { active: true }, "Bugs"));
    const c = classes(on);
    expect(c).toEqual(expect.arrayContaining(["bg-tint", "border-link", "text-link", "font-bold"]));
    expect(c).not.toContain("bg-primary");
    expect(c).not.toContain("text-primary-foreground");
    expect(c).not.toContain("font-semibold");
  });

  it("inactive : carte et filet (outline) ou sans fond (ghost), en 600", () => {
    const outline = classes(html(createElement(ToggleChip, { active: false }, "Tous")));
    expect(outline).toEqual(expect.arrayContaining(["bg-card", "border-border", "font-semibold"]));
    expect(outline).not.toContain("bg-tint");
    const ghost = toggleChip({ active: false, appearance: "ghost" }).className.split(" ");
    expect(ghost).toEqual(expect.arrayContaining(["border-transparent", "text-muted-foreground"]));
    expect(ghost).not.toContain("bg-card");
  });

  it("bouton : aria-pressed suit l'état, type button par défaut, data-active pour les couleurs forcées", () => {
    const on = html(createElement(ToggleChip, { active: true }, "Idées"));
    expect(on).toMatch(/^<button type="button" aria-pressed="true" data-slot="toggle-chip" data-active="true" /);
    const off = html(createElement(ToggleChip, { active: false }, "Idées"));
    expect(off).toContain('aria-pressed="false"');
    expect(off).not.toContain("data-active");
  });

  it("attributs pour un lien : pas d'ARIA imposé, classes fusionnées (la classe passée l'emporte)", () => {
    const props = toggleChip({ active: true, size: "wrap", className: "px-4" });
    expect(props["data-slot"]).toBe("toggle-chip");
    expect(props["data-active"]).toBe("true");
    expect(props).not.toHaveProperty("aria-current");
    const c = props.className.split(" ");
    expect(c).toContain("whitespace-normal");
    expect(c).not.toContain("whitespace-nowrap");
    expect(c).toContain("px-4");
    expect(c).not.toContain("px-3");
    expect(toggleChip({ active: false })["data-active"]).toBeUndefined();
  });
});
