import { describe, expect, it } from "vitest";
import { isExpectedRange, MAX_RANGE_BYTES, parseContentRange, parseRange } from "@/lib/pdf-range";

describe("plages du lecteur PDF (PERF-06)", () => {
  it("parseRange : un seul intervalle fermé, borné", () => {
    expect(parseRange("bytes=0-65535")).toEqual({ start: 0, end: 65535 });
    expect(parseRange(" bytes=100-100 ")).toEqual({ start: 100, end: 100 });
    expect(parseRange(`bytes=0-${MAX_RANGE_BYTES - 1}`)).toEqual({ start: 0, end: MAX_RANGE_BYTES - 1 });
  });

  it("parseRange : refuse suffixe, intervalle ouvert, multiple, inversé ou trop grand", () => {
    for (const h of [null, "", "bytes=-500", "bytes=500-", "bytes=0-1,5-9", "bytes=10-5", `bytes=0-${MAX_RANGE_BYTES}`, "items=0-5", "bytes=a-b"]) {
      expect(parseRange(h), String(h)).toBeNull();
    }
  });

  it("parseContentRange : taille totale connue et bornes cohérentes", () => {
    expect(parseContentRange("bytes 0-1023/2215244")).toEqual({ start: 0, end: 1023, total: 2215244 });
    for (const h of [null, "bytes 0-1023/*", "bytes */2215244", "bytes 10-5/100", "bytes 0-100/100", "0-10/100"]) expect(parseContentRange(h), String(h)).toBeNull();
  });

  it("isExpectedRange : exactement la plage voulue, ou tronquée à la fin du fichier seulement", () => {
    expect(isExpectedRange({ start: 0, end: 65535, total: 1_000_000 }, 0, 65535)).toBe(true);
    expect(isExpectedRange({ start: 999_900, end: 999_999, total: 1_000_000 }, 999_900, 1_065_435)).toBe(true);
    expect(isExpectedRange({ start: 0, end: 1023, total: 1_000_000 }, 0, 65535)).toBe(false);
    expect(isExpectedRange({ start: 65536, end: 131071, total: 1_000_000 }, 0, 65535)).toBe(false);
    expect(isExpectedRange(null, 0, 65535)).toBe(false);
  });
});
