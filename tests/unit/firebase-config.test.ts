import { describe, expect, it, vi } from "vitest";
import { hasFirebasePublicConfig } from "@/lib/firebase/config";

/** Un seul test « Firebase configuré » pour le navigateur et le serveur (QUAL-24), relu à chaque appel. */
describe("hasFirebasePublicConfig", () => {
  it("vrai seulement si les trois valeurs publiques sont présentes", () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "demo-key");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "demo-sextant");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_APP_ID", "demo-app");
    expect(hasFirebasePublicConfig()).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_APP_ID", "");
    expect(hasFirebasePublicConfig()).toBe(false);
  });
});
