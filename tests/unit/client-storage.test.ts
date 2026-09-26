// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { hasStored, readStored, readStoredJson, removeStored, writeStored } from "@/lib/client/storage";
import { readRecent, RECENT_KEY } from "@/lib/recent";
import { readHidden } from "@/lib/recommendations-shared";
import { storedThemePreference } from "@/lib/theme";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

/** Stockage qui lève à chaque accès (cookies et données de site bloqués, navigation privée de certains navigateurs). */
function breakStorage() {
  for (const area of ["localStorage", "sessionStorage"] as const) {
    vi.spyOn(window, area, "get").mockImplementation(() => {
      throw new DOMException("refusé", "SecurityError");
    });
  }
}

describe("stockage du navigateur sans exception (QUAL-31)", () => {
  it("écrit, relit et efface, en local ou dans l'onglet", () => {
    writeStored("k", "v");
    writeStored("k", "onglet", "session");
    expect(readStored("k")).toBe("v");
    expect(readStored("k", "session")).toBe("onglet");
    removeStored("k");
    expect(readStored("k")).toBeNull();
    expect(readStored("k", "session")).toBe("onglet");
  });

  it("JSON relu tel quel, null s'il est absent ou illisible", () => {
    writeStored("j", JSON.stringify([1, "a"]));
    expect(readStoredJson("j")).toEqual([1, "a"]);
    writeStored("j", "{pas du json");
    expect(readStoredJson("j")).toBeNull();
    expect(readStoredJson("absent")).toBeNull();
  });

  it("drapeau : vrai, faux, ou null quand le stockage est illisible", () => {
    expect(hasStored("vu")).toBe(false);
    writeStored("vu", "1");
    expect(hasStored("vu")).toBe(true);
    breakStorage();
    expect(hasStored("vu")).toBeNull();
  });

  it("stockage qui lève : replis sans exception, et les modules qui s'en servent aussi", () => {
    breakStorage();
    expect(readStored("k")).toBeNull();
    expect(() => writeStored("k", "v")).not.toThrow();
    expect(() => removeStored("k", "session")).not.toThrow();
    expect(readStoredJson(RECENT_KEY)).toBeNull();
    expect(readRecent()).toEqual([]);
    expect(readHidden()).toEqual([]);
    expect(storedThemePreference()).toBe("system");
  });
});
