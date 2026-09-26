import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Politique de confidentialité et durées de conservation (NEW-14) : tant que l'éditeur n'a pas décidé (durées à null),
 * la page publique n'affiche aucun emplacement « à compléter » ; une durée décidée apparaît en clair.
 */
const retention = vi.hoisted(() => ({ RETENTION: { inactiveAccountMonths: null as number | null, unusedKeyMonths: null as number | null } }));
vi.mock("@/lib/retention", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/retention")>()), RETENTION: retention.RETENTION }));
// Adresse de contact configurée, comme en production : seul l'emplacement des durées est en cause ici.
vi.mock("@/lib/site", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/site")>();
  return { ...mod, SITE: { ...mod.SITE, contactEmail: "contact@exemple.org" } };
});

const { default: PrivacyPage } = await import("@/app/confidentialite/page");
const render = () => renderToStaticMarkup(createElement(PrivacyPage)).replace(/<[^>]+>/g, "").replace(/\s+/g, " ");

describe("/confidentialite : durées de conservation", () => {
  beforeEach(() => {
    retention.RETENTION.inactiveAccountMonths = null;
    retention.RETENTION.unusedKeyMonths = null;
  });

  it("durées non décidées : texte actuel, sans emplacement à compléter", () => {
    const text = render();
    expect(text).not.toContain("à compléter");
    expect(text).toContain("Durée : tant que le compte existe. Sa suppression");
    expect(text).toContain("toutes sont supprimées avec le compte.");
    expect(text).not.toContain("supprimée automatiquement");
  });

  it("durées décidées : affichées en clair", () => {
    retention.RETENTION.inactiveAccountMonths = 36;
    retention.RETENTION.unusedKeyMonths = 12;
    const text = render();
    expect(text).not.toContain("à compléter");
    expect(text).toContain("tant que le compte existe, et au plus 3 ans après votre dernière connexion");
    expect(text).toContain("toutes sont supprimées avec le compte. Une clé inutilisée pendant 1 an");
  });
});
