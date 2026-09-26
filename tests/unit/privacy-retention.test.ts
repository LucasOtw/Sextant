import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Politique de confidentialité et durées de conservation (NEW-14) : tant que l'éditeur n'a pas décidé (durées à null),
 * la page publique n'affiche aucun emplacement « à compléter » ; une durée décidée apparaît en clair.
 */
const retention = vi.hoisted(() => ({ RETENTION: { inactiveAccountMonths: null as number | null, unusedKeyMonths: null as number | null, messageMonths: null as number | null } }));
vi.mock("@/lib/retention", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/retention")>()), RETENTION: retention.RETENTION }));
// Adresse de contact configurée, comme en production : seul l'emplacement des durées est en cause ici.
vi.mock("@/lib/site", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/site")>();
  return { ...mod, SITE: { ...mod.SITE, contactEmail: "contact@exemple.org" } };
});

const { default: PrivacyPage } = await import("@/app/confidentialite/page");
const render = () => renderToStaticMarkup(createElement(PrivacyPage)).replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("/confidentialite : durées de conservation", () => {
  beforeEach(() => {
    retention.RETENTION.inactiveAccountMonths = null;
    retention.RETENTION.unusedKeyMonths = null;
    retention.RETENTION.messageMonths = null;
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

  it("signalements et messages : base légale, destinataires, durée réelle (aucune suppression automatique tant qu'elle n'est pas décidée)", () => {
    const text = render();
    expect(text).toContain("Signalements et messages");
    expect(text).toContain("RGPD art. 6.1.c");
    expect(text).toContain("jusqu'à ce qu'il les supprime ; aucune suppression automatique n'est prévue.");
    retention.RETENTION.messageMonths = 12;
    expect(render()).toContain("restent dans la messagerie de l'éditeur, au plus 1 an après la fin de l'échange.");
  });

  it("inventaires exacts : clés (début de la clé, date de la connexion), stockage du navigateur, compteurs anti-abus", () => {
    const text = render();
    expect(text).toContain("ses dix premiers caractères pour que vous la reconnaissiez");
    expect(text).toContain("la date de la connexion Google depuis laquelle elle a été créée");
    expect(text).toContain("l'annonce des assistants IA");
    expect(text).toContain("les condensés IA que vous avez déjà demandés");
    expect(text).not.toContain("quelques minutes");
    expect(text).toContain("favoris, dernier favori retiré et dates des favoris retirés récemment");
    expect(text).toContain("sa date d'ajout et celle du retrait");
  });
});
