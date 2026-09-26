import { describe, expect, it } from "vitest";
import { fileSlug, sameSnapshot, sanitizeSnapshot, snapshotForStorage, snapshotFromData, snapshotFromWork } from "@/lib/favorites-shared";
import { makeSnapshot, makeWork } from "../fixtures";

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

  it("SEC-06 — retire les caractères de contrôle et de mise en forme (bidi U+202E) des champs texte", () => {
    const out = sanitizeSnapshot(
      makeSnapshot({ title: "Vrai\u202E titre\u0000", authors: "A\u200B B", authorNames: ["Nom\u2066 masqué", "\u202E"], venue: "Revue\u202D", topic: "\u0007Sujet" }),
    )!;
    expect(out.title).toBe("Vrai titre");
    expect(out.authors).toBe("A B");
    expect(out.authorNames).toEqual(["Nom masqué"]);
    expect(out.venue).toBe("Revue");
    expect(out.topic).toBe("Sujet");
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

describe("fileSlug", () => {
  it("nom de fichier sûr, accents retirés, repli sur « liste »", () => {
    expect(fileSlug("Mémoire 2026 : Santé !")).toBe("memoire-2026-sante");
    expect(fileSlug("../../etc/passwd")).toBe("etc-passwd");
    expect(fileSlug("***")).toBe("liste");
  });
});

describe("snapshotFromData (relecture Firestore, QUAL-11)", () => {
  it("rend l'instantané stocké tel quel", () => {
    const s = makeSnapshot();
    expect(snapshotFromData({ ...s, addedAt: { seconds: 1 }, unverified: true }, "W9")).toEqual(s);
  });

  it("tolère un document incomplet ou mal typé : valeurs par défaut, identifiant de repli", () => {
    expect(snapshotFromData(undefined, "W7")).toEqual({
      id: "W7", title: "", authors: "", authorNames: [], venue: null, year: null, doi: null, type: "article", isOa: false, citedByCount: 0, topic: null,
    });
    const odd = snapshotFromData({ id: "", title: 12, authorNames: ["A", 3, null, "B"], year: "2018", citedByCount: Infinity, type: "", venue: 5 }, "W8");
    expect(odd).toMatchObject({ id: "W8", title: "", authorNames: ["A", "B"], year: null, citedByCount: 0, type: "article", venue: null });
  });
});

describe("volume, numéro et pages dans l'instantané (QUAL-02)", () => {
  const biblio = { volume: "6", issue: null, firstPage: "e4375", lastPage: null };

  it("snapshotFromWork les garde ; absents quand OpenAlex n'en donne aucun", () => {
    expect(snapshotFromWork(makeWork()).biblio).toEqual(biblio);
    expect(snapshotFromWork(makeWork({ biblio: undefined }))).not.toHaveProperty("biblio");
    expect(snapshotFromWork(makeWork({ biblio: { volume: null, issue: null, first_page: null, last_page: null } }))).not.toHaveProperty("biblio");
  });

  it("sanitizeSnapshot : facultatif, chaînes bornées à 20 caractères, le reste ignoré", () => {
    expect(sanitizeSnapshot(makeSnapshot())).not.toHaveProperty("biblio");
    const out = sanitizeSnapshot({ ...makeSnapshot(), biblio: { volume: "v".repeat(50), issue: 3, firstPage: "1‮2", lastPage: "", extra: "x" } })!;
    expect(out.biblio).toEqual({ volume: "v".repeat(20), issue: null, firstPage: "12", lastPage: null });
    expect(sanitizeSnapshot({ ...makeSnapshot(), biblio: "vol. 6" })).not.toHaveProperty("biblio");
  });

  it("snapshotFromData relit le biblio stocké ; null ou absent → pas de biblio", () => {
    expect(snapshotFromData({ ...makeSnapshot(), biblio }, "W1").biblio).toEqual(biblio);
    expect(snapshotFromData({ ...makeSnapshot(), biblio: null }, "W1")).not.toHaveProperty("biblio");
  });

  it("snapshotForStorage écrit toujours biblio (null ou quatre clés) : une fusion Firestore n'en garde rien d'ancien", () => {
    expect(snapshotForStorage(makeSnapshot()).biblio).toBeNull();
    expect(snapshotForStorage(makeSnapshot({ biblio })).biblio).toEqual(biblio);
  });

  it("sameSnapshot : un volume ou des pages différents comptent ; null stocké = absent", () => {
    const s = makeSnapshot({ biblio });
    expect(sameSnapshot({ ...s }, s)).toBe(true);
    expect(sameSnapshot({ ...s, biblio: { ...biblio, volume: "7" } }, s)).toBe(false);
    expect(sameSnapshot({ ...makeSnapshot() }, s)).toBe(false);
    expect(sameSnapshot({ ...makeSnapshot(), biblio: null }, makeSnapshot())).toBe(true);
  });
});
