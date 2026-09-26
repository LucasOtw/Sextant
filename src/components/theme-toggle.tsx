"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { followSystemTheme } from "@/lib/theme";
import type { ThemeMenuProps } from "@/components/theme-menu";

/** Nom fixe, le même au rendu serveur et après hydratation ; l'état se lit dans le menu (A11Y-39). */
export const THEME_LABEL = "Thème d'affichage";

/**
 * Lune en clair, soleil en sombre. Le CSS choisit d'après la classe `dark`, posée avant l'affichage : pas de mauvaise
 * icône jusqu'à l'hydratation (A11Y-39).
 */
export function ThemeIcon() {
  return (
    <>
      <MoonIcon className="dark:hidden" aria-hidden />
      <SunIcon className="hidden dark:block" aria-hidden />
    </>
  );
}

// Le menu (Base UI Menu, positionnement) n'est téléchargé qu'à la première intention : survol, focus ou clic (PERF-03).
const loadThemeMenu = () => import("@/components/theme-menu");

interface LoadedMenu {
  Menu: ComponentType<ThemeMenuProps>;
  open: boolean;
  focus: boolean;
}

/** Choix du thème : Clair / Sombre / Système. Sans choix enregistré, on suit le système (voir lib/theme.ts). */
export function ThemeToggle() {
  const [loaded, setLoaded] = useState<LoadedMenu | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const loading = useRef(false);
  const wantsOpen = useRef(false);

  // Sans choix enregistré, l'affichage suit le système en cours de session (A11Y-40).
  useEffect(() => followSystemTheme(), []);

  function load() {
    if (loading.current) return;
    loading.current = true;
    loadThemeMenu().then(
      (m) => {
        // Le bouton provisoire laisse la place au vrai déclencheur : il reprend le focus, et le menu s'ouvre si un clic
        // l'a demandé pendant le téléchargement, sauf si l'utilisateur est allé ailleurs entre-temps.
        const active = document.activeElement;
        const here = active === button.current;
        const idle = !active || active === document.body;
        setLoaded({ Menu: m.default, open: wantsOpen.current && (here || idle), focus: here });
      },
      () => {
        loading.current = false;
      },
    );
  }

  if (loaded) return <loaded.Menu defaultOpen={loaded.open} takeFocus={loaded.focus} />;
  return (
    <Button
      ref={button}
      variant="ghost"
      size="icon"
      aria-label={THEME_LABEL}
      title={THEME_LABEL}
      aria-haspopup="menu"
      aria-expanded={false}
      className="rounded-full"
      onPointerEnter={load}
      onFocus={load}
      onClick={() => {
        wantsOpen.current = true;
        load();
      }}
    >
      <ThemeIcon />
    </Button>
  );
}
