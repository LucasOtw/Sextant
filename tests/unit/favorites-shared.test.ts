import { describe, expect, it } from "vitest";
import { fileSlug, sanitizeSnapshot, snapshotFromWork, WORK_ID } from "@/lib/favorites-shared";
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
