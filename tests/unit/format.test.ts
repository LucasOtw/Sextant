import { describe, expect, it } from "vitest";
import {
  abstractFromInvertedIndex,
  formatAuthors,
  isPublicPdfUrl,
  languageName,
  embeddablePdfUrl,
  openAccessPdfUrls,
  openAccessUrl,
  publisherUrl,
  RETRACTED_APA_SUFFIX,
  toApa,
  toBibtex,
  truncateWords,
} from "@/lib/format";
import { safeHttpUrl } from "@/lib/text";
import { location, makeWork } from "../fixtures";

describe("isPublicPdfUrl (garde SSRF du relais PDF)", () => {
  it.each([
    "https://arxiv.org/pdf/2101.00001.pdf",
    "http://www.ncbi.nlm.nih.gov/pmc/articles/PMC1/pdf/x.pdf",
    "https://hal.science:443/hal-01/document",
    "http://example.org:80/a.pdf",
  ])("accepte une adresse publique : %s", (url) => {
    expect(isPublicPdfUrl(url)).toBe(true);
  });

  it.each([
    ["adresse illisible", "pas une adresse"],
    ["schéma non http(s)", "ftp://example.org/a.pdf"],
    ["schéma javascript", "javascript:alert(1)"],
    ["schéma file", "file:///etc/passwd"],
    ["port exotique", "https://example.org:8080/a.pdf"],
    ["localhost", "http://localhost/a.pdf"],
    ["sous-domaine de localhost", "http://api.localhost/a.pdf"],
    ["mDNS .local", "http://printer.local/a.pdf"],
    ["métadonnées cloud .internal", "http://metadata.google.internal/computeMetadata/v1/"],
    ["DNS inverse .arpa", "http://1.0.0.127.in-addr.arpa/a.pdf"],
    ["IPv4 littérale", "http://127.0.0.1/a.pdf"],
    ["IPv4 privée", "http://10.0.0.1/a.pdf"],
    ["IPv4 en décimal (normalisée par URL)", "http://2130706433/a.pdf"],
    ["IPv4 en hexadécimal (normalisée par URL)", "http://0x7f000001/a.pdf"],
    ["IPv6 de bouclage", "http://[::1]/a.pdf"],
    ["IPv6 mappée IPv4", "http://[::ffff:127.0.0.1]/a.pdf"],
    ["hôte sans point (intranet)", "http://intranet/a.pdf"],
  ])("refuse : %s", (_label, url) => {
    expect(isPublicPdfUrl(url)).toBe(false);
  });

  // Contournements du filtre par nom d'hôte corrigés par SEC-05 (lot 6 de l'audit) : le point final est retiré avant
  // les tests. Le DNS joker (`127.0.0.1.nip.io`) ne se voit pas dans l'URL : il est refusé à la résolution
  // (tests/unit/public-fetch.test.ts, `safeLookup`).
  it.each([
    ["point final après localhost", "http://localhost./a.pdf"],
    ["plusieurs points finaux", "http://localhost../a.pdf"],
    ["point final après .internal", "http://metadata.google.internal./computeMetadata/v1/"],
    ["point final après .local", "http://printer.local./a.pdf"],
    ["port de l'API d'exécution Lambda", "http://example.org:9001/2018-06-01/runtime/invocation/next"],
    ["IPv4 littérale avec point final", "http://127.0.0.1./a.pdf"],
  ])("SEC-05 — refuse : %s", (_label, url) => {
    expect(isPublicPdfUrl(url)).toBe(false);
  });
});

describe("openAccessPdfUrls", () => {
  it("ne propose rien pour un article fermé", () => {
    expect(openAccessPdfUrls(makeWork())).toEqual([]);
  });

  it("met la meilleure copie d'abord, dédoublonne et écarte les adresses non publiques", () => {
    const w = makeWork({
      open_access: { is_oa: true, oa_status: "green", oa_url: null },
      best_oa_location: location({ is_oa: true, pdf_url: "https://arxiv.org/pdf/1.pdf" }),
      primary_location: location({ is_oa: true, pdf_url: "https://arxiv.org/pdf/1.pdf" }),
      locations: [
        location({ is_oa: true, pdf_url: "http://127.0.0.1/interne.pdf" }),
        location({ is_oa: false, pdf_url: "https://editeur.example.com/payant.pdf" }),
        location({ is_oa: true, pdf_url: "https://hal.science/hal-1/document" }),
        location({ is_oa: true, pdf_url: null }),
      ],
    });
    expect(openAccessPdfUrls(w)).toEqual(["https://arxiv.org/pdf/1.pdf", "https://hal.science/hal-1/document"]);
  });
});

describe("openAccessUrl", () => {
  it("préfère le PDF, sinon la page en accès ouvert, sinon rien", () => {
    expect(openAccessUrl(makeWork({ best_oa_location: location({ pdf_url: "https://a.org/x.pdf" }) }))).toEqual({ url: "https://a.org/x.pdf", isPdf: true });
    expect(openAccessUrl(makeWork({ open_access: { is_oa: true, oa_status: "gold", oa_url: "https://a.org/x" } }))).toEqual({ url: "https://a.org/x", isPdf: false });
    expect(openAccessUrl(makeWork())).toBeNull();
  });

  it("écarte une adresse hors http(s) et passe à la suivante (SEC-16)", () => {
    const w = makeWork({
      open_access: { is_oa: true, oa_status: "green", oa_url: "https://depot.example.org/notice" },
      best_oa_location: location({ pdf_url: "data:text/html,<h1>faux</h1>" }),
      primary_location: location({ pdf_url: "https://depot.example.org/a.pdf" }),
    });
    expect(openAccessUrl(w)).toEqual({ url: "https://depot.example.org/a.pdf", isPdf: true });
    const noPdf = makeWork({ open_access: { is_oa: true, oa_status: "green", oa_url: "blob:https://x/1" }, best_oa_location: location({ landing_page_url: "https://depot.example.org/n" }) });
    expect(openAccessUrl(noPdf)).toEqual({ url: "https://depot.example.org/n", isPdf: false });
  });
});

describe("publisherUrl", () => {
  it("DOI d'abord, sinon la page de l'éditeur, jamais un schéma exotique", () => {
    expect(publisherUrl(makeWork())).toBe("https://doi.org/10.1000/xyz123");
    expect(publisherUrl(makeWork({ doi: null, primary_location: location({ landing_page_url: "https://editeur.example.com/a" }) }))).toBe("https://editeur.example.com/a");
    expect(publisherUrl(makeWork({ doi: "javascript:alert(1)", primary_location: location({ landing_page_url: "file:///etc/passwd" }) }))).toBeNull();
  });
});

describe("embeddablePdfUrl (repli <object> du lecteur, SEC-16)", () => {
  it("un PDF en accès ouvert, en https et sur un hôte public", () => {
    const w = makeWork({
      open_access: { is_oa: true, oa_status: "green", oa_url: null },
      best_oa_location: location({ is_oa: true, pdf_url: "http://depot.example.org/a.pdf" }),
      locations: [location({ is_oa: true, pdf_url: "https://10.0.0.1/b.pdf" }), location({ is_oa: true, pdf_url: "https://hal.science/hal-1/document" })],
    });
    expect(embeddablePdfUrl(w)).toBe("https://hal.science/hal-1/document");
  });

  it("null sans candidat sûr : http seul, hôte privé, ou article fermé", () => {
    const httpOnly = makeWork({ open_access: { is_oa: true, oa_status: "green", oa_url: null }, best_oa_location: location({ is_oa: true, pdf_url: "http://depot.example.org/a.pdf" }) });
    expect(embeddablePdfUrl(httpOnly)).toBeNull();
    const privateHost = makeWork({ open_access: { is_oa: true, oa_status: "green", oa_url: null }, best_oa_location: location({ is_oa: true, pdf_url: "https://intranet.local/a.pdf" }) });
    expect(embeddablePdfUrl(privateHost)).toBeNull();
    expect(embeddablePdfUrl(makeWork({ best_oa_location: location({ pdf_url: "https://arxiv.org/pdf/1.pdf" }) }))).toBeNull();
  });
});

describe("safeHttpUrl", () => {
  it.each(["https://doi.org/10.1/x", "http://example.org/a?b=c#d"])("accepte %s", (u) => {
    expect(safeHttpUrl(u)).toBe(u);
  });

  it.each([null, undefined, "", "pas une adresse", "javascript:alert(1)", "data:text/html,x", "blob:https://x/1", "file:///etc/passwd", "ftp://example.org/a", "https://user:mdp@example.org/"])("refuse %s", (u) => {
    expect(safeHttpUrl(u)).toBeNull();
  });
});

describe("abstractFromInvertedIndex", () => {
  it("reconstruit le texte dans l'ordre des positions", () => {
    expect(abstractFromInvertedIndex({ monde: [1], Bonjour: [0], "!": [2] })).toBe("Bonjour monde !");
  });

  it("gère les mots répétés", () => {
    expect(abstractFromInvertedIndex({ le: [0, 2], chat: [1], chien: [3] })).toBe("le chat le chien");
  });

  it("renvoie null sans index ou pour un index vide", () => {
    expect(abstractFromInvertedIndex(null)).toBeNull();
    expect(abstractFromInvertedIndex(undefined)).toBeNull();
    expect(abstractFromInvertedIndex({})).toBeNull();
  });
});

describe("formatAuthors", () => {
  const withAuthors = (n: number) =>
    makeWork({ authorships: Array.from({ length: n }, (_, i) => ({ author_position: "middle" as const, author: { id: null, display_name: `Auteur ${i + 1}`, orcid: null }, institutions: [] })) });

  it("joint à la française et abrège au-delà du maximum", () => {
    expect(formatAuthors(withAuthors(0))).toBe("Auteurs inconnus");
    expect(formatAuthors(withAuthors(1))).toBe("Auteur 1");
    expect(formatAuthors(withAuthors(3))).toBe("Auteur 1, Auteur 2 et Auteur 3");
    expect(formatAuthors(withAuthors(4))).toBe("Auteur 1, Auteur 2, Auteur 3 et 1 autre");
    expect(formatAuthors(withAuthors(6))).toBe("Auteur 1, Auteur 2, Auteur 3 et 3 autres");
  });
});

describe("citations depuis un article OpenAlex", () => {
  it("APA : auteurs, année, titre, revue, volume, pages et DOI", () => {
    expect(toApa(makeWork())).toBe(
      "Piwowar, H., & Priem, J. (2018). Open access and citation advantage. PeerJ, 6, e4375. https://doi.org/10.1000/xyz123",
    );
  });

  it("APA : sans auteur ni année", () => {
    expect(toApa(makeWork({ authorships: [], publication_year: null, primary_location: null, doi: null }))).toBe(
      "Anonyme (s. d.). Open access and citation advantage.",
    );
  });

  it("APA : un article rétracté le dit", () => {
    expect(toApa(makeWork({ is_retracted: true })).endsWith(RETRACTED_APA_SUFFIX)).toBe(true);
  });

  it("BibTeX : entrée complète, DOI sans préfixe, caractères spéciaux échappés", () => {
    const bib = toBibtex(makeWork({ title: "Coûts & bénéfices_100%", is_retracted: true }));
    expect(bib).toBe(
      [
        "@article{piwowar2018cots,",
        "  title = {Coûts \\& bénéfices\\_100\\%},",
        "  author = {Heather Piwowar and Jason Priem},",
        "  year = {2018},",
        "  journal = {PeerJ},",
        "  volume = {6},",
        "  pages = {e4375},",
        "  doi = {10.1000/xyz123},",
        "  note = {Retracted},",
        "}",
      ].join("\n"),
    );
  });

  it("BibTeX : une communication de conférence devient inproceedings avec booktitle", () => {
    const bib = toBibtex(makeWork({ type: "conference-paper" }));
    expect(bib.startsWith("@inproceedings{")).toBe(true);
    expect(bib).toContain("  booktitle = {PeerJ},");
  });
});

describe("petits formats", () => {
  it("truncateWords", () => {
    expect(truncateWords("un deux trois", 5)).toBe("un deux trois");
    expect(truncateWords("un deux trois quatre", 2)).toBe("un deux…");
  });

  it("languageName", () => {
    expect(languageName("EN")).toBe("anglais");
    expect(languageName("xx")).toBe("XX");
  });
});
