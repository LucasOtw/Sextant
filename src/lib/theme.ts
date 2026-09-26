/**
 * Thème d'affichage, côté navigateur. Le choix « clair » ou « sombre » est mémorisé ; « système » efface la clé, et le
 * site suit alors la préférence du système (A11Y-40). Le script d'avant l'affichage (lib/pre-hydration.ts) lit la même
 * clé pour poser la classe `dark` avant le premier rendu.
 */
export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Choix enregistré, « system » sans choix (ou stockage indisponible). */
export function storedThemePreference(): ThemePreference {
  try {
    const t = localStorage.getItem(THEME_STORAGE_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

function systemPrefersDark(): boolean {
  return typeof matchMedia === "function" && matchMedia(DARK_QUERY).matches;
}

function applyTheme(dark: boolean) {
  const html = document.documentElement;
  html.classList.toggle("dark", dark);
  html.style.colorScheme = dark ? "dark" : "light";
}

/** Enregistre le choix (ou l'efface pour « system ») et l'applique aussitôt. */
export function setThemePreference(pref: ThemePreference) {
  try {
    if (pref === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* stockage indisponible : le choix vaut pour la page ouverte */
  }
  applyTheme(pref === "system" ? systemPrefersDark() : pref === "dark");
}

/**
 * Sans choix enregistré, suit le système en cours de session (bascule automatique jour / nuit). Renvoie la fonction
 * qui retire l'écouteur.
 */
export function followSystemTheme(): () => void {
  if (typeof matchMedia !== "function") return () => {};
  const query = matchMedia(DARK_QUERY);
  const onChange = () => {
    if (storedThemePreference() === "system") applyTheme(query.matches);
  };
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
