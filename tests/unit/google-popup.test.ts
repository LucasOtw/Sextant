import { describe, expect, it, vi } from "vitest";

/**
 * Fenêtre Google bloquée : si le SDK Firebase Auth n'était pas encore prêt au moment du clic, la fenêtre est partie
 * après une attente réseau (hors activation utilisateur) et un second clic suffit. Le message ne renvoie aux réglages
 * du navigateur que si le SDK était déjà prêt. SDK et client Firebase simulés : aucune requête vers Google.
 */
const sdk = vi.hoisted(() => ({
  signInWithPopup: vi.fn(async () => {
    throw Object.assign(new Error("bloquée"), { code: "auth/popup-blocked" });
  }),
  signOut: vi.fn(async () => undefined),
}));
vi.mock("firebase/auth", () => sdk);
vi.mock("@/lib/firebase/client", () => ({ firebaseAuth: () => ({}), googleProvider: () => ({}) }));

const { withGooglePopup } = await import("@/components/auth/google-popup");

describe("withGooglePopup : fenêtre bloquée", () => {
  it("SDK pas encore prêt au clic : invite à cliquer de nouveau ; déjà prêt : renvoie aux réglages", async () => {
    await expect(withGooglePopup(async () => "jeton")).rejects.toThrow("cliquez de nouveau");
    await expect(withGooglePopup(async () => "jeton")).rejects.toThrow("Autorisez les fenêtres surgissantes");
  });
});
