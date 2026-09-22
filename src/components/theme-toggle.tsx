"use client";

import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";

function current(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Bascule clair/sombre. Le choix est mémorisé ; sans choix, on suit le système (voir le script dans layout). */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture du DOM après hydratation
    setTheme(current());
  }, []);

  function toggle() {
    const next: Theme = current() === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.style.colorScheme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* stockage indisponible */
    }
    setTheme(next);
  }

  const label = theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre";
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label={label} title={label} className="rounded-full">
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </Button>
  );
}
