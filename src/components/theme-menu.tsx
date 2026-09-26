"use client";

import { useEffect, useRef, useState } from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeIcon, THEME_LABEL } from "@/components/theme-toggle";
import { setThemePreference, storedThemePreference, type ThemePreference } from "@/lib/theme";

export interface ThemeMenuProps {
  /** Ouvert d'emblée : un clic sur le bouton provisoire l'a demandé pendant le téléchargement. */
  defaultOpen: boolean;
  /** Le bouton provisoire avait le focus : le déclencheur le reprend. */
  takeFocus: boolean;
}

/**
 * Menu du thème, chargé à la demande par ThemeToggle et rendu seulement dans le navigateur : l'état lu ici (choix
 * enregistré) n'a pas à correspondre au HTML du serveur. Les choix sont des éléments radio, leur état est annoncé.
 */
export default function ThemeMenu({ defaultOpen, takeFocus }: ThemeMenuProps) {
  const [pref, setPref] = useState<ThemePreference>(storedThemePreference);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (takeFocus) trigger.current?.focus();
  }, [takeFocus]);

  function choose(value: string) {
    const next = value as ThemePreference;
    setThemePreference(next);
    setPref(next);
  }

  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger
        ref={trigger}
        aria-label={THEME_LABEL}
        title={THEME_LABEL}
        render={<Button variant="ghost" size="icon" className="rounded-full" />}
      >
        <ThemeIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuRadioGroup value={pref} onValueChange={choose}>
          <DropdownMenuLabel>{THEME_LABEL}</DropdownMenuLabel>
          <DropdownMenuRadioItem value="light" closeOnClick>
            <SunIcon aria-hidden /> Clair
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" closeOnClick>
            <MoonIcon aria-hidden /> Sombre
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system" closeOnClick>
            <MonitorIcon aria-hidden /> Système
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
