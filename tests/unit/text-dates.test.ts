import { describe, expect, it } from "vitest";
import { fold, stripAccents } from "@/lib/text";
import { CALENDAR_DATE_LONG, DATE_LONG, DATE_SHORT, DATE_TIME } from "@/lib/dates";
import { formatCount, formatDate, formatInteger } from "@/lib/format";
import { fileSlug } from "@/lib/favorites-shared";
import { bibKey } from "@/lib/citation";

/** Espaces insécables (fines ou non) d'Intl ramenées à une espace ordinaire : on teste le texte, pas la typographie. */
const plain = (s: string | null) => s?.replace(/[  ]/g, " ") ?? null;

describe("pliage des accents, une seule implémentation (QUAL-30)", () => {
  it("stripAccents retire les diacritiques et garde la casse", () => {
    expect(stripAccents("Élève Ça Über naïve")).toBe("Eleve Ca Uber naive");
  });

  it("fold plie accents et casse", () => {
    expect(fold("Écologie ÇA Forêt")).toBe("ecologie ca foret");
  });

  it("nom de fichier d'une liste et clé BibTeX passent par le même pliage", () => {
    expect(fileSlug("Écologie & forêts — 2026")).toBe("ecologie-forets-2026");
    expect(fileSlug("  ")).toBe("liste");
    expect(bibKey({ id: "W1", title: "Étude des sols", authorNames: ["Ana Pérez"], year: 2021 })).toBe("perez2021etude");
  });
});

describe("dates de l'interface (QUAL-30)", () => {
  it("un horodatage entre minuit et 2 h à Paris garde son jour de Paris (« membre depuis »)", () => {
    const d = new Date("2025-03-10T23:30:00Z");
    expect(DATE_LONG.format(d)).toBe("11 mars 2025");
    expect(DATE_SHORT.format(d)).toBe("11 mars 2025");
    expect(plain(DATE_TIME.format(d))).toMatch(/^11 mars 2025.*00:30$/);
  });

  it("une date seule d'OpenAlex garde son jour, formatée en UTC", () => {
    expect(formatDate("2024-03-15")).toBe("15 mars 2024");
    expect(CALENDAR_DATE_LONG.format(new Date("2024-01-01"))).toBe("1 janvier 2024");
    expect(formatDate(null)).toBeNull();
    expect(formatDate("pas une date")).toBeNull();
  });
});

describe("nombres (formats créés une fois)", () => {
  it("entiers groupés à la française, compteur compact à partir de 10 000", () => {
    expect(plain(formatInteger(12345))).toBe("12 345");
    expect(plain(formatCount(9876))).toBe("9 876");
    expect(plain(formatCount(12345))).toBe("12 k");
  });
});
