// @vitest-environment happy-dom
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { followSystemTheme, setThemePreference, storedThemePreference, THEME_STORAGE_KEY } from "@/lib/theme";
import { PRE_HYDRATION_SCRIPT } from "@/lib/pre-hydration";

/** Préférence du système simulée : `dark` se change en cours de test, et prévient les écouteurs comme le navigateur. */
function fakeSystem(initialDark: boolean) {
  let dark = initialDark;
  const listeners = new Set<() => void>();
  const query = {
    get matches() {
      return dark;
    },
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  vi.stubGlobal("matchMedia", () => query);
  return {
    set(next: boolean) {
      dark = next;
      for (const fn of listeners) fn();
    },
    listeners,
  };
}

const isDark = () => document.documentElement.classList.contains("dark");

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
  document.documentElement.style.colorScheme = "";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("thème : Clair / Sombre / Système (A11Y-40)", () => {
  it("sans choix enregistré (ou valeur inconnue), la préférence est « system »", () => {
    expect(storedThemePreference()).toBe("system");
    localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    expect(storedThemePreference()).toBe("system");
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    expect(storedThemePreference()).toBe("dark");
  });

  it("stockage indisponible : « system », sans lever d'erreur", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqué");
    });
    expect(storedThemePreference()).toBe("system");
  });

  it("un choix explicite est enregistré et appliqué, quel que soit le système", () => {
    fakeSystem(false);
    setThemePreference("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(isDark()).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
    setThemePreference("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(isDark()).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("« system » efface la clé et applique aussitôt la préférence du système", () => {
    fakeSystem(true);
    setThemePreference("light");
    setThemePreference("system");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(isDark()).toBe(true);
  });

  it("stockage en écriture bloqué : le choix s'applique quand même à la page", () => {
    fakeSystem(false);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("plein");
    });
    expect(() => setThemePreference("dark")).not.toThrow();
    expect(isDark()).toBe(true);
  });

  it("sans choix, la bascule du système en cours de session est suivie ; avec un choix, elle est ignorée", () => {
    const system = fakeSystem(false);
    const stop = followSystemTheme();
    system.set(true);
    expect(isDark()).toBe(true);
    system.set(false);
    expect(isDark()).toBe(false);

    setThemePreference("dark");
    system.set(false);
    expect(isDark()).toBe(true);

    stop();
    expect(system.listeners.size).toBe(0);
  });

  it("la barre du navigateur (meta theme-color) prend le fond du thème affiché, pas celui du système", () => {
    fakeSystem(false);
    const metas = ["(prefers-color-scheme: light)", "(prefers-color-scheme: dark)"].map((media) => {
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      meta.media = media;
      meta.content = "#FFFFFF";
      document.head.append(meta);
      return meta;
    });
    const html = document.documentElement;
    html.style.setProperty("--background", "#0D111A");
    setThemePreference("dark");
    expect(metas.map((m) => m.content)).toEqual(["#0D111A", "#0D111A"]);
    html.style.removeProperty("--background");
    for (const m of metas) m.remove();
  });

  it("le script d'avant l'affichage lit la même clé", () => {
    expect(PRE_HYDRATION_SCRIPT).toContain(`localStorage.getItem("${THEME_STORAGE_KEY}")`);
  });
});

describe("tailles de texte en rem, pas en px (A11Y-38)", () => {
  it("aucune classe text-[…px] dans src : les textes suivent la taille de police choisie dans le navigateur", () => {
    const root = path.resolve(__dirname, "../../src");
    const offenders = (readdirSync(root, { recursive: true }) as string[])
      .filter((f) => /\.(tsx?|css)$/.test(f))
      .flatMap((f) => [...readFileSync(path.join(root, f), "utf8").matchAll(/\btext-\[\d+(?:\.\d+)?px\]/g)].map((m) => `${f}: ${m[0]}`));
    expect(offenders).toEqual([]);
  });
});
