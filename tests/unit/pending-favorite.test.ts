// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { clearPendingFavorite, PENDING_FAVORITE_KEY, PENDING_MAX_AGE_MS, readPendingFavorite, writePendingFavorite } from "@/components/favorites/pending-favorite";
import { makeSnapshot } from "../fixtures";

afterEach(() => sessionStorage.clear());

describe("favori en attente pendant la connexion (QUAL-12)", () => {
  it("écrit puis relu une seule fois", () => {
    writePendingFavorite(makeSnapshot());
    expect(readPendingFavorite()?.id).toBe("W4200000001");
    expect(sessionStorage.getItem(PENDING_FAVORITE_KEY)).toBeNull();
    expect(readPendingFavorite()).toBeNull();
  });

  it("au-delà de 10 minutes, ou illisible, ou sans identifiant : ignoré", () => {
    writePendingFavorite(makeSnapshot());
    expect(readPendingFavorite(Date.now() + PENDING_MAX_AGE_MS + 1)).toBeNull();
    sessionStorage.setItem(PENDING_FAVORITE_KEY, "{pas du json");
    expect(readPendingFavorite()).toBeNull();
    sessionStorage.setItem(PENDING_FAVORITE_KEY, JSON.stringify({ snapshot: {}, at: Date.now() }));
    expect(readPendingFavorite()).toBeNull();
  });

  it("effacé à la fermeture de la fenêtre de connexion sans succès", () => {
    writePendingFavorite(makeSnapshot());
    clearPendingFavorite();
    expect(readPendingFavorite()).toBeNull();
  });
});
