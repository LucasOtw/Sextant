import { describe, expect, it } from "vitest";
import { fileSlug, insertAt, sameSnapshot, sanitizePlacement, sanitizeSnapshot, snapshotForStorage, snapshotFromData, snapshotFromWork } from "@/lib/favorites-shared";
import { MAX_COLLECTIONS } from "@/lib/collections-shared";
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

  it("DOI : forme 10.NNNN/suffixe exigée, accolades, antislash et blancs refusés (injection BibTeX)", () => {
    const doi = (value: string) => sanitizeSnapshot(makeSnapshot({ doi: value }))!.doi;
    expect(doi("https://doi.org/10.7717/peerj.4375")).toBe("https://doi.org/10.7717/peerj.4375");
    expect(doi("https://doi.org/10.1/x}, title = {\\input{/etc/passwd}")).toBeNull();
    expect(doi("https://doi.org/10.1000/a b")).toBeNull();
    expect(doi("https://doi.org/10.1000/a\\b")).toBeNull();
    expect(doi("https://doi.org/pas-un-doi")).toBeNull();
    expect(doi(`https://doi.org/10.1000/${"x".repeat(300)}`)).toBeNull();
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

describe("place d'un favori retiré (« Annuler », NEW-8)", () => {
  const NOW = Date.parse("2026-09-26T12:00:00.000Z");

  it("garde une place valide ; date ramenée au plus tard à maintenant, date illisible = inconnue", () => {
    const placement = { addedAt: "2025-01-02T03:04:05.000Z", index: 3, lists: [{ id: "a", index: 0 }, { id: "b_2-X", index: 7 }] };
    expect(sanitizePlacement(placement, NOW)).toEqual(placement);
    expect(sanitizePlacement({ ...placement, addedAt: "2030-01-01T00:00:00.000Z" }, NOW)?.addedAt).toBe("2026-09-26T12:00:00.000Z");
    expect(sanitizePlacement({ ...placement, addedAt: "hier" }, NOW)?.addedAt).toBeNull();
    expect(sanitizePlacement({ ...placement, addedAt: null }, NOW)?.addedAt).toBeNull();
  });

  it("date avant l'an 1 (hors de la plage d'un Timestamp Firestore) = inconnue, au lieu d'une erreur 502", () => {
    const placement = { index: null, lists: [] };
    for (const addedAt of ["0000-12-31T00:00:00Z", "-001000-01-01T00:00:00Z"]) {
      expect(sanitizePlacement({ ...placement, addedAt }, NOW)?.addedAt, addedAt).toBeNull();
    }
    expect(sanitizePlacement({ ...placement, addedAt: "0001-01-01T00:00:00Z" }, NOW)?.addedAt).toBe("0001-01-01T00:00:00.000Z");
  });

  it("rang invalide de l'index = en dernier ; doublons de listes ignorés", () => {
    for (const index of [-1, 1.5, "2", null, 1000]) expect(sanitizePlacement({ addedAt: null, index, lists: [] }, NOW)?.index).toBeNull();
    expect(sanitizePlacement({ addedAt: null, index: 0, lists: [{ id: "a", index: 1 }, { id: "a", index: 4 }] }, NOW)?.lists).toEqual([{ id: "a", index: 1 }]);
  });

  it("refuse une forme inutilisable : pas un objet, listes absentes ou trop nombreuses, identifiant ou rang de liste invalide", () => {
    expect(sanitizePlacement(null)).toBeNull();
    expect(sanitizePlacement({ addedAt: null, index: 0 })).toBeNull();
    expect(sanitizePlacement({ lists: Array.from({ length: MAX_COLLECTIONS + 1 }, (_, i) => ({ id: `l${i}`, index: 0 })) })).toBeNull();
    expect(sanitizePlacement({ lists: [{ id: "../autre", index: 0 }] })).toBeNull();
    expect(sanitizePlacement({ lists: [{ id: "a", index: -1 }] })).toBeNull();
    expect(sanitizePlacement({ lists: ["a"] })).toBeNull();
  });

  it("insertAt : copie, rang ramené dans les bornes, null = en dernier", () => {
    const items = ["a", "b", "c"];
    expect(insertAt(items, "x", 1)).toEqual(["a", "x", "b", "c"]);
    expect(insertAt(items, "x", 0)).toEqual(["x", "a", "b", "c"]);
    expect(insertAt(items, "x", 99)).toEqual(["a", "b", "c", "x"]);
    expect(insertAt(items, "x", null)).toEqual(["a", "b", "c", "x"]);
    expect(items).toEqual(["a", "b", "c"]);
  });
});
