import { describe, expect, it } from "vitest";
import { legalContactEmail, legalPublisherName, missingLegalIdentity } from "@/lib/site";

describe("identité légale (lib/site.ts)", () => {
  it("nom de l'éditeur : vide ou valeur d'exemple = absent", () => {
    for (const raw of [undefined, "", "   ", "Prénom Nom", "prenom nom", "PRÉNOM  NOM"]) expect(legalPublisherName(raw), String(raw)).toBeNull();
    expect(legalPublisherName("  Marie Curie ")).toBe("Marie Curie");
  });

  it("adresse de contact : vide, mal formée ou d'exemple = absente (liens « Signaler » vers les mentions légales)", () => {
    for (const raw of [undefined, "", "contact", "contact@exemple.fr", "CONTACT@Example.com", "a@mail.exemple.org", "x@site.test", "x@y.example", "a b@c.fr"]) {
      expect(legalContactEmail(raw), String(raw)).toBeNull();
    }
    expect(legalContactEmail(" contact@sextant.fr ")).toBe("contact@sextant.fr");
    expect(legalContactEmail("moi@exemplaire.fr")).toBe("moi@exemplaire.fr");
  });

  it("build de production : nomme chaque variable manquante ou d'exemple", () => {
    expect(missingLegalIdentity({ LEGAL_PUBLISHER_NAME: "Prénom Nom", LEGAL_CONTACT_EMAIL: "contact@exemple.fr" })).toEqual(["LEGAL_PUBLISHER_NAME", "LEGAL_CONTACT_EMAIL"]);
    expect(missingLegalIdentity({ LEGAL_PUBLISHER_NAME: "Marie Curie" })).toEqual(["LEGAL_CONTACT_EMAIL"]);
    expect(missingLegalIdentity({ LEGAL_PUBLISHER_NAME: "Marie Curie", LEGAL_CONTACT_EMAIL: "contact@sextant.fr" })).toEqual([]);
  });
});
