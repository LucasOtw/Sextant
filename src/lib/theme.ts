/**
 * Thème d'affichage, côté navigateur. Le choix « clair » ou « sombre » est mémorisé ; « système » efface la clé, et le
 * site suit alors la préférence du système (A11Y-40). Le script d'avant l'affichage (lib/pre-hydration.ts) lit la même
 * clé pour poser la classe `dark` avant le premier rendu.
 */
import { readStored, removeStored, writeStored } from "@/lib/client/storage";

export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Choix enregistré, « system » sans choix (ou stockage indisponible). */
export function storedThemePreference(): ThemePreference {
  const t = readStored(THEME_STORAGE_KEY);
  return t === "light" || t === "dark" ? t : "system";
}

function systemPrefersDark(): boolean {
  return typeof matchMedia === "function" && matchMedia(DARK_QUERY).matches;
}

/**
 * Barre du navigateur (meta theme-color, une par préférence du système) recalée sur le fond du thème affiché : sans
 * cela, elle suivrait le système et non la bascule du site. Couleur lue dans les jetons (--background), jamais recopiée.
 */
function syncThemeColor() {
  const color = getComputedStyle(document.documentElement).getPropertyValue("--background").trim();
  if (!color) return;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) meta.content = color;
}

function applyTheme(dark: boolean) {
  const html = document.documentElement;
  html.classList.toggle("dark", dark);
  html.style.colorScheme = dark ? "dark" : "light";
  syncThemeColor();
}

/** Enregistre le choix (ou l'efface pour « system ») et l'applique aussitôt. */
export function setThemePreference(pref: ThemePreference) {
  // Stockage indisponible : le choix vaut pour la page ouverte.
  if (pref === "system") removeStored(THEME_STORAGE_KEY);
  else writeStored(THEME_STORAGE_KEY, pref);
  applyTheme(pref === "system" ? systemPrefersDark() : pref === "dark");
}

/**
 * Sans choix enregistré, suit le système en cours de session (bascule automatique jour / nuit). Renvoie la fonction
 * qui retire l'écouteur.
 */
export function followSystemTheme(): () => void {
  // Thème posé avant l'affichage (lib/pre-hydration.ts) : la barre du navigateur le rejoint dès le montage.
  syncThemeColor();
  if (typeof matchMedia !== "function") return () => {};
  const query = matchMedia(DARK_QUERY);
  const onChange = () => {
    if (storedThemePreference() === "system") applyTheme(query.matches);
  };
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
