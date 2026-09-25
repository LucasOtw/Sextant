import { describe, expect, it } from "vitest";
import {
  apaFromSnapshot,
  bibField,
  bibtexAll,
  citeInline,
  fileSlug,
  sanitizeSnapshot,
  snapshotFromWork,
  splitAuthorName,
  WORK_ID,
} from "@/lib/favorites-shared";
import { makeSnapshot, makeWork } from "../fixtures";

describe("WORK_ID (identifiant d'article accepté par les routes)", () => {
  it.each(["W1", "W4200000001", `W${"9".repeat(31)}`])("accepte %s", (id) => {
    expect(WORK_ID.test(id)).toBe(true);
  });

  it.each(["", "W", "w123", "A123", "W12a", "W123 ", " W123", "../W1", "W1/notes", `W${"9".repeat(32)}`, "https://openalex.org/W1"])(
    "refuse %j",
    (id) => {
      expect(WORK_ID.test(id)).toBe(false);
    },
  );
});

describe("sanitizeSnapshot (instantané envoyé par le client)", () => {
  it("garde un instantané valide tel quel", () => {
    const s = makeSnapshot();
    expect(sanitizeSnapshot(s)).toEqual(s);
  });

  it("refuse une entrée qui n'est pas un objet, un identifiant invalide ou un titre vide", () => {
    expect(sanitizeSnapshot(null)).toBeNull();
    expect(sanitizeSnapshot("W1")).toBeNull();
    expect(sanitizeSnapshot(makeSnapshot({ id: "users/abc" }))).toBeNull();
    expect(sanitizeSnapshot(makeSnapshot({ title: "" }))).toBeNull();
  });

  it("ne garde que les champs attendus, bornés", () => {
    const out = sanitizeSnapshot({
      ...makeSnapshot(),
      title: "t".repeat(2000),
      authors: "a".repeat(2000),
      authorNames: ["x".repeat(500), 42, null, ...Array.from({ length: 80 }, (_, i) => `Nom ${i}`)],
      admin: true,
      uid: "autre-utilisateur",
    });
    expect(out).not.toBeNull();
    expect(out).not.toHaveProperty("admin");
    expect(out).not.toHaveProperty("uid");
    expect(out!.title).toHaveLength(500);
    expect(out!.authors).toHaveLength(300);
    expect(out!.authorNames).toHaveLength(50);
    expect(out!.authorNames[0]).toHaveLength(120);
  });

  it("normalise les champs typés : année entière, citations positives, DOI doi.org seulement", () => {
    const out = sanitizeSnapshot(makeSnapshot({ year: 2018.7, citedByCount: -5, doi: "javascript:alert(1)" }))!;
    expect(out.year).toBe(2018);
    expect(out.citedByCount).toBe(0);
    expect(out.doi).toBeNull();
    const loose = sanitizeSnapshot({ id: "W1", title: "Titre", year: "2018", citedByCount: Infinity, type: "", isOa: "oui" })!;
    expect(loose).toMatchObject({ year: null, citedByCount: 0, type: "article", isOa: true, venue: null, topic: null, authorNames: [] });
  });

  it("snapshotFromWork produit un instantané que l'assainissement accepte sans rien changer", () => {
    const s = snapshotFromWork(makeWork());
    expect(s.id).toBe("W4200000001");
    expect(sanitizeSnapshot(s)).toEqual(s);
  });
});

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
    expect(apaFromSnapshot(makeSnapshot())).toBe(
      "Piwowar, H., & Priem, J. (2018). Open access and citation advantage. PeerJ. https://doi.org/10.1000/xyz123",
    );
  });

  it("APA : anonyme, sans date, rétracté", () => {
    expect(apaFromSnapshot(makeSnapshot({ authorNames: [], year: null, venue: null, doi: null }), true)).toBe(
      "Anonyme (s. d.). Open access and citation advantage. [Article rétracté]",
    );
  });

  it("APA : au-delà de 20 auteurs, les 19 premiers puis le dernier", () => {
    const names = Array.from({ length: 25 }, (_, i) => `Prénom Nom${i + 1}`);
    const apa = apaFromSnapshot(makeSnapshot({ authorNames: names }));
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
    expect(entries[2]).toBe(["@phdthesis{curie1903thse,", "  title = {Une thèse remarquable},", "  author = {Marie Curie},", "  year = {1903},", "  school = {Sorbonne},", "}"].join("\n"));
  });
});

describe("fileSlug", () => {
  it("nom de fichier sûr, accents retirés, repli sur « liste »", () => {
    expect(fileSlug("Mémoire 2026 : Santé !")).toBe("memoire-2026-sante");
    expect(fileSlug("../../etc/passwd")).toBe("etc-passwd");
    expect(fileSlug("***")).toBe("liste");
  });
});
