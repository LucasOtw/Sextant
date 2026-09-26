import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AUTHOR_ID, BATCH_WORK_ID, DOC_ID, doiPath, INSTITUTION_ID, normalizeId, normalizeWorkId, shortId, TOPIC_ID, WORK_ID } from "@/lib/ids";

/** Identifiants (QUAL-14) : une seule forme par type, bornée, commune aux routes, aux pages, au MCP et au client. */
describe("WORK_ID (identifiant d'article accepté par les routes)", () => {
  it.each(["W1", "W4200000001", `W${"9".repeat(15)}`])("accepte %s", (id) => {
    expect(WORK_ID.test(id)).toBe(true);
  });

  // Au-delà de 15 chiffres, OpenAlex ne répond qu'après 10 à 20 s (504 et relance) : refusé avant tout appel.
  it.each(["", "W", "w123", "A123", "W12a", "W123 ", " W123", "../W1", "W1/notes", `W${"9".repeat(16)}`, `W${"9".repeat(31)}`, "https://openalex.org/W1"])(
    "refuse %j",
    (id) => {
      expect(WORK_ID.test(id)).toBe(false);
    },
  );
});

describe("BATCH_WORK_ID (identifiant gardé dans un lot OpenAlex)", () => {
  it("exige au moins 2 chiffres : « W1 » ferait refuser tout le lot", () => {
    expect(BATCH_WORK_ID.test("W1")).toBe(false);
    expect(BATCH_WORK_ID.test("W12")).toBe(true);
    expect(BATCH_WORK_ID.test(`W${"9".repeat(16)}`)).toBe(false);
  });
});

describe("normalizeId / normalizeWorkId", () => {
  it("remet en majuscules et retire les espaces autour", () => {
    expect(normalizeWorkId("w2741809807")).toBe("W2741809807");
    expect(normalizeWorkId(" W123 ")).toBe("W123");
    expect(normalizeId("a5023888391", AUTHOR_ID)).toBe("A5023888391");
    expect(normalizeId("i136199984", INSTITUTION_ID)).toBe("I136199984");
    expect(normalizeId("t10017", TOPIC_ID)).toBe("T10017");
  });

  it.each([null, undefined, "", "W", "W1/../W2", "W2741809807?per-page=1", `W${"9".repeat(20)}`, "A123"])("refuse %j", (raw) => {
    expect(normalizeWorkId(raw)).toBeNull();
  });

  it("n'accepte pas un identifiant d'un autre type", () => {
    expect(normalizeId("W1", AUTHOR_ID)).toBeNull();
    expect(normalizeId("A1", INSTITUTION_ID)).toBeNull();
  });
});

describe("DOC_ID (document Firestore : liste, surlignage)", () => {
  it("identifiant automatique accepté, chemin ou longueur excessive refusés", () => {
    expect(DOC_ID.test("aZ09_-xyz")).toBe(true);
    for (const bad of ["", "a/b", "..", "a b", "x".repeat(65)]) expect(DOC_ID.test(bad)).toBe(false);
  });
});

describe("shortId et doiPath", () => {
  it("shortId retire le préfixe OpenAlex, et seulement lui", () => {
    expect(shortId("https://openalex.org/A123")).toBe("A123");
    expect(shortId("http://openalex.org/T10017")).toBe("T10017");
    expect(shortId("W1")).toBe("W1");
  });

  it("doiPath donne le DOI nu", () => {
    expect(doiPath("https://doi.org/10.1000/xyz")).toBe("10.1000/xyz");
    expect(doiPath("http://DOI.ORG/10.1/A")).toBe("10.1/A");
    expect(doiPath("10.1000/xyz")).toBe("10.1000/xyz");
  });
});

/**
 * Frontière serveur/client (QUAL-15) : le client OpenAlex et les fournisseurs IA lisent des secrets ; ils sont réservés
 * au serveur (`server-only`), et aucun composant client ne les importe en valeur (un `import type` est effacé).
 */
describe("frontière serveur/client", () => {
  const src = path.resolve(__dirname, "../../src");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
    });

  it("lib/openalex.ts et lib/ai.ts commencent par import \"server-only\"", () => {
    for (const f of ["lib/openalex.ts", "lib/ai.ts"]) expect(readFileSync(path.join(src, f), "utf8").startsWith('import "server-only";')).toBe(true);
  });

  it("lib/ids.ts n'importe rien (importable partout)", () => {
    expect(readFileSync(path.join(src, "lib/ids.ts"), "utf8")).not.toMatch(/^\s*import\s/m);
  });

  it("aucun composant client n'importe lib/openalex ou lib/ai en valeur", () => {
    const offenders = files(src).filter((f) => {
      const code = readFileSync(f, "utf8");
      if (!/^["']use client["'];?/m.test(code)) return false;
      return /^import\s+(?!type\b)[^;]*from\s+["']@\/lib\/(openalex|ai)["']/m.test(code);
    });
    expect(offenders).toEqual([]);
  });
});
