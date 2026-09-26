import { describe, expect, it } from "vitest";
import { recentRemoval, RESTORE_WINDOW_MS, staleRemovals } from "@/lib/favorites";

/**
 * « Annuler » avec plusieurs toasts (NEW-8) : chaque retrait garde sa date d'ajout d'origine côté serveur
 * (`recentRemovals`), et non plus le seul dernier. Horodatages simulés (forme des Timestamp Firestore).
 */
const ts = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
const now = Date.parse("2026-09-26T12:00:00.000Z");
const w1 = Date.parse("2025-03-04T05:06:07.000Z");
const w2 = Date.parse("2025-06-07T08:09:10.000Z");

describe("retraits récents (« Annuler », NEW-8)", () => {
  const map = {
    W1: { addedAt: ts(w1), at: ts(now - 2_000) },
    W2: { addedAt: ts(w2), at: ts(now - 1_000) },
    W3: { addedAt: ts(w1), at: ts(now - RESTORE_WINDOW_MS - 1) },
    W4: { addedAt: null, at: ts(now - 500) },
    W5: { addedAt: ts(w1), at: "illisible" },
  };

  it("retirer W1 puis W2 : chacun garde sa propre date d'ajout, pas seulement le dernier retiré", () => {
    expect(recentRemoval(map, "W1", now)).toEqual({ found: true, addedAt: new Date(w1) });
    expect(recentRemoval(map, "W2", now)).toEqual({ found: true, addedAt: new Date(w2) });
  });

  it("hors délai, absent, date de retrait illisible ou champ mal formé : pas de date d'origine", () => {
    expect(recentRemoval(map, "W3", now)).toEqual({ found: false, addedAt: null });
    expect(recentRemoval(map, "W9", now)).toEqual({ found: false, addedAt: null });
    expect(recentRemoval(map, "W5", now)).toEqual({ found: false, addedAt: null });
    expect(recentRemoval(undefined, "W1", now)).toEqual({ found: false, addedAt: null });
    expect(recentRemoval(["W1"], "W1", now)).toEqual({ found: false, addedAt: null });
    expect(recentRemoval(map, "constructor", now)).toEqual({ found: false, addedAt: null });
  });

  it("date d'ajout d'origine inconnue : retrait trouvé (entrée à effacer), date du serveur", () => {
    expect(recentRemoval(map, "W4", now)).toEqual({ found: true, addedAt: null });
  });

  it("entrées à effacer au retrait suivant : expirées ou illisibles seulement", () => {
    expect(staleRemovals(map, now).sort()).toEqual(["W3", "W5"]);
    expect(staleRemovals(null, now)).toEqual([]);
  });
});
