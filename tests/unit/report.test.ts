import { describe, expect, it } from "vitest";
import { REPORT_SECTION, reportBody, reportHref } from "@/lib/report";

describe("lien de signalement (DSA art. 16, SEC-13)", () => {
  it("sans adresse de contact : renvoie à la section des mentions légales", () => {
    expect(reportHref(null, "liste partagée", "https://sextant.test/liste/abc")).toBe(REPORT_SECTION);
    expect(REPORT_SECTION).toBe("/mentions-legales#signaler");
  });

  it("avec adresse : courriel prérempli, objet et corps encodés", () => {
    const href = reportHref("contact@exemple.org", "sujet « Bugs & idées » f1", "https://sextant.test/retours#sujet-f1");
    expect(href.startsWith("mailto:contact@exemple.org?subject=")).toBe(true);
    const url = new URL(href);
    expect(url.searchParams.get("subject")).toBe("Signalement : sujet « Bugs & idées » f1");
    expect(url.searchParams.get("body")).toBe(reportBody("https://sextant.test/retours#sujet-f1"));
    // Aucun caractère réservé laissé brut : « & » ou « # » du texte ne coupent pas les paramètres.
    expect(href.split("?")[1].split("&")).toHaveLength(2);
    expect(href).not.toContain("#");
  });

  it("le corps demande les éléments exigés : adresse exacte, motif, coordonnées, bonne foi", () => {
    const body = reportBody("https://sextant.test/liste/abc");
    expect(body).toContain("https://sextant.test/liste/abc");
    expect(body).toMatch(/Motif/);
    expect(body).toMatch(/nom et adresse e-mail/);
    expect(body).toMatch(/bonne foi/);
  });
});
