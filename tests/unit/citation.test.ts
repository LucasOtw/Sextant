import { describe, expect, it } from "vitest";
import { bibField, bibKey, bibtexAll, citeInline, formatApa, formatBibtex, splitAuthorName } from "@/lib/citation";
import { citationFromWork, snapshotFromWork } from "@/lib/favorites-shared";
import { makeSnapshot, makeWork } from "../fixtures";

/** Auteurs OpenAlex d'une notice de test. */
const authors = (...names: string[]) =>
  names.map((display_name) => ({ author_position: "middle" as const, author: { id: null, display_name, orcid: null }, institutions: [] }));

describe("bibField", () => {
  it("échappe les caractères spéciaux LaTeX", () => {
    expect(bibField("50% & $5 #1 a_b")).toBe("50\\% \\& \\$5 \\#1 a\\_b");
    expect(bibField("a\\b")).toBe("a\\textbackslash{}b");
  });

  it("équilibre les accolades : orphelines fermantes retirées, ouvrantes refermées", () => {
    expect(bibField("a}b")).toBe("ab");
    expect(bibField("{a")).toBe("{a}");
    expect(bibField("{{a}")).toBe("{{a}}");
    expect(bibField("}{DNA}")).toBe("{DNA}");
  });
});

describe("splitAuthorName", () => {
  it.each([
    ["Heather Piwowar", { last: "Piwowar", initials: "H." }],
    ["Jean-Pierre Dupont", { last: "Dupont", initials: "J.-P." }],
    ["Ludwig van der Berg", { last: "van der Berg", initials: "L." }],
    ["Plato", { last: "Plato", initials: "" }],
    ["  ", { last: "", initials: "" }],
  ])("%j", (full, expected) => {
    expect(splitAuthorName(full)).toEqual(expected);
  });
});

describe("références depuis un instantané", () => {
  it("APA : deux auteurs, revue et DOI", () => {
    expect(formatApa(makeSnapshot())).toBe(
      "Piwowar, H., & Priem, J. (2018). Open access and citation advantage. PeerJ. https://doi.org/10.1000/xyz123",
    );
  });

  it("APA : anonyme, sans date, rétracté", () => {
    expect(formatApa(makeSnapshot({ authorNames: [], year: null, venue: null, doi: null }), true)).toBe(
      "Anonyme (s. d.). Open access and citation advantage. [Article rétracté]",
    );
  });

  it("APA : au-delà de 20 auteurs, les 19 premiers puis le dernier", () => {
    const names = Array.from({ length: 25 }, (_, i) => `Prénom Nom${i + 1}`);
    const apa = formatApa(makeSnapshot({ authorNames: names }));
    expect(apa).toContain("Nom19, P., … Nom25, P. (2018)");
    expect(apa).not.toContain("Nom20,");
  });

  it("appel de citation court", () => {
    expect(citeInline(makeSnapshot({ authorNames: [] }))).toBe("(Anonyme, 2018)");
    expect(citeInline(makeSnapshot({ authorNames: ["Heather Piwowar"] }), 4)).toBe("(Piwowar, 2018, p. 4)");
    expect(citeInline(makeSnapshot())).toBe("(Piwowar & Priem, 2018)");
    expect(citeInline(makeSnapshot({ authorNames: ["A Un", "B Deux", "C Trois"], year: null }))).toBe("(Un et al., s. d.)");
  });

  it("bibtexAll : clés rendues uniques et articles rétractés marqués", () => {
    const a = makeSnapshot({ id: "W1" });
    const b = makeSnapshot({ id: "W2" });
    const c = makeSnapshot({ id: "W3", type: "dissertation", title: "Une thèse remarquable", authorNames: ["Marie Curie"], year: 1903, venue: "Sorbonne", doi: null });
    const out = bibtexAll([a, b, c], new Set(["W2"]));
    const entries = out.split("\n\n");
    expect(entries).toHaveLength(3);
    expect(entries[0].split("\n")[0]).toBe("@article{piwowar2018open,");
    expect(entries[1].split("\n")[0]).toBe("@article{piwowar2018openb,");
    expect(entries[0]).not.toContain("note = {Retracted}");
    expect(entries[1]).toContain("  note = {Retracted},");
    expect(entries[2]).toBe(["@phdthesis{curie1903these,", "  title = {Une thèse remarquable},", "  author = {Marie Curie},", "  year = {1903},", "  school = {Sorbonne},", "}"].join("\n"));
  });
});

describe("un même article est cité de la même façon partout (QUAL-02)", () => {
  it.each([
    ["Jean-Pierre van der Berg", "van der Berg, J.-P.", "vanderberg2018open"],
    ["Ludwig van Beethoven", "van Beethoven, L.", "vanbeethoven2018open"],
    ["María de la Cruz", "de la Cruz, M.", "delacruz2018open"],
    ["Jean-Pierre Dupont", "Dupont, J.-P.", "dupont2018open"],
    ["Plato", "Plato", "plato2018open"],
    ["José García Müller", "Müller, J. G.", "muller2018open"],
  ])("%j : même nom et même clé sur la fiche et dans les favoris", (name, apaName, key) => {
    const work = makeWork({ authorships: authors(name) });
    const fiche = citationFromWork(work);
    const favori = snapshotFromWork(work);
    expect(formatApa(fiche).startsWith(`${apaName} (2018).`)).toBe(true);
    expect(formatApa(favori).startsWith(`${apaName} (2018).`)).toBe(true);
    expect(bibKey(fiche)).toBe(key);
    expect(bibKey(favori)).toBe(key);
  });

  it.each([
    ["dissertation", "@phdthesis", "school"],
    ["book", "@book", "publisher"],
    ["conference-paper", "@inproceedings", "booktitle"],
    ["article", "@article", "journal"],
    ["preprint", "@article", "journal"],
  ])("type %s → %s avec %s, sur la fiche comme dans les favoris", (type, kind, field) => {
    const work = makeWork({ type });
    for (const source of [citationFromWork(work), snapshotFromWork(work)]) {
      const bib = formatBibtex(source);
      expect(bib.startsWith(`${kind}{`)).toBe(true);
      expect(bib).toContain(`  ${field} = {PeerJ},`);
    }
  });

  it("fiche et favoris : références identiques, volume et pages compris", () => {
    const work = makeWork({ biblio: { volume: "12", issue: "3", first_page: "45", last_page: "67" } });
    expect(formatApa(snapshotFromWork(work))).toBe(formatApa(citationFromWork(work)));
    expect(formatBibtex(snapshotFromWork(work))).toBe(formatBibtex(citationFromWork(work)));
  });

  it("volume, numéro et pages quand la notice les donne, rien sinon", () => {
    const work = makeWork({ biblio: { volume: "12", issue: "3", first_page: "45", last_page: "67" } });
    expect(formatApa(citationFromWork(work))).toContain(" PeerJ, 12(3), 45–67. https://doi.org/");
    const bib = formatBibtex(citationFromWork(work));
    expect(bib).toContain("  volume = {12},\n  number = {3},\n  pages = {45--67},\n  doi = {10.1000/xyz123},");
    const none = citationFromWork(makeWork({ biblio: undefined }));
    expect(formatApa(none)).toContain(" PeerJ. https://doi.org/");
    expect(formatBibtex(none)).not.toMatch(/volume|number|pages/);
  });

  it("page unique (numéro d'article, first_page == last_page) : pas d'intervalle « e1234–e1234 »", () => {
    const work = makeWork({ biblio: { volume: "6", issue: null, first_page: "e1234", last_page: "e1234" } });
    for (const source of [citationFromWork(work), snapshotFromWork(work)]) {
      expect(formatApa(source)).toContain(" PeerJ, 6, e1234. https://doi.org/");
      expect(formatBibtex(source)).toContain("  pages = {e1234},");
    }
  });

  it("DOI d'un instantané non vérifié : accolades, antislash et blancs retirés du champ doi, `_` et `%` gardés", () => {
    const source = makeSnapshot({ doi: "https://doi.org/10.1/x}, title = {\\input{/etc/passwd}" });
    const bib = formatBibtex(source);
    expect(bib).toContain("  doi = {10.1/x,title=input/etc/passwd},");
    expect(bib.match(/^  title = /gm)).toHaveLength(1);
    expect(formatBibtex(makeSnapshot({ doi: "https://doi.org/10.1000/a_b%c" }))).toContain("  doi = {10.1000/a_b%c},");
  });

  it("sans auteur : pas de champ author vide, « Anonyme » en APA, clé en « anon »", () => {
    const source = citationFromWork(makeWork({ authorships: [] }));
    expect(formatBibtex(source)).not.toContain("author");
    expect(formatBibtex(source).startsWith("@article{anon2018open,")).toBe(true);
    expect(formatApa(source).startsWith("Anonyme (2018).")).toBe(true);
  });

  it("au-delà de 50 auteurs, l'instantané garde le dernier : l'APA des favoris cite le vrai dernier auteur", () => {
    const names = Array.from({ length: 60 }, (_, i) => `Prénom Nom${i + 1}`);
    const work = makeWork({ authorships: authors(...names), biblio: undefined });
    const favori = snapshotFromWork(work);
    expect(favori.authorNames).toHaveLength(50);
    expect(favori.authorNames.at(-1)).toBe("Prénom Nom60");
    expect(formatApa(favori)).toContain("Nom19, P., … Nom60, P. (2018)");
    expect(formatApa(citationFromWork(work))).toBe(formatApa(favori));
    // La fiche garde tous les auteurs dans le BibTeX.
    expect(formatBibtex(citationFromWork(work))).toContain("Prénom Nom55");
  });

  it("deux auteurs, 21 auteurs : mêmes règles APA", () => {
    expect(formatApa(makeSnapshot()).startsWith("Piwowar, H., & Priem, J. (2018).")).toBe(true);
    const names = Array.from({ length: 21 }, (_, i) => `Prénom Nom${i + 1}`);
    const apa = formatApa(makeSnapshot({ authorNames: names }));
    expect(apa).toContain("Nom19, P., … Nom21, P. (2018)");
    expect(apa).not.toContain("Nom20,");
  });
});

describe("clés BibTeX jamais vides ni invalides (QUAL-08)", () => {
  it("accents translittérés : « Étude » donne « etude »", () => {
    expect(bibKey(makeSnapshot({ authorNames: ["Jean-Pierre Changeux"], year: 2020, title: "Étude du cerveau" }))).toBe("changeux2020etude");
  });

  it.each([
    ["chinois", "张伟", "机器学习的研究"],
    ["japonais", "山田太郎", "機械学習に関する研究"],
    ["cyrillique", "Иван Петров", "Исследование машинного обучения"],
  ])("auteur et titre %s sans année : clé tirée de l'identifiant", (_, author, title) => {
    const s = makeSnapshot({ id: "W7143667567", authorNames: [author], year: null, title });
    expect(bibKey(s)).toBe("w7143667567");
    expect(formatBibtex(s).startsWith("@article{w7143667567,")).toBe(true);
  });

  it("auteur non latin mais titre latin : l'année et le mot du titre", () => {
    expect(bibKey(makeSnapshot({ authorNames: ["张伟"], year: 2020, title: "Deep learning survey" }))).toBe("2020deep");
  });

  it("titre sans mot de plus de trois lettres : repli « work »", () => {
    expect(bibKey(makeSnapshot({ title: "A to Z" }))).toBe("piwowar2018work");
  });

  it("bibtexAll : 30 doublons gardent des clés uniques et valides (b… z, puis aa…)", () => {
    const items = Array.from({ length: 30 }, (_, i) => makeSnapshot({ id: `W${i + 1}`, authorNames: ["张伟"], year: null, title: "机器学习" }));
    // Même identifiant : même clé de base, les suffixes font la différence.
    const same = items.map((s) => ({ ...s, id: "W1" }));
    const keys = bibtexAll(same).split("\n\n").map((e) => e.match(/^@\w+\{([^,]*),/)![1]);
    expect(new Set(keys).size).toBe(30);
    expect(keys.every((k) => /^[a-z0-9]+$/.test(k))).toBe(true);
    expect(keys.slice(0, 3)).toEqual(["w1", "w1b", "w1c"]);
    expect(keys[25]).toBe("w1z");
    expect(keys[26]).toBe("w1aa");
  });

  it("bibtexAll : un suffixe ne reprend jamais une clé naturelle déjà émise", () => {
    const a = makeSnapshot({ id: "W1" });
    const b = makeSnapshot({ id: "W2" });
    const c = makeSnapshot({ id: "W3", title: "Openb advantage" });
    const keys = bibtexAll([a, c, b]).split("\n\n").map((e) => e.split("\n")[0]);
    expect(keys).toEqual(["@article{piwowar2018open,", "@article{piwowar2018openb,", "@article{piwowar2018openc,"]);
  });
});
