"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
// Import direct voulu, pas de dynamic() : la fenêtre doit s'afficher dès le premier rendu (cf. commit 0a474b8).
import WelcomeDialogContent from "@/components/welcome-dialog-content";
import { isQuietRoute } from "@/lib/quiet-routes";

const KEY = "sextant:welcomed";

/**
 * Message d'accueil affiché une seule fois par navigateur : ce que l'outil fait, et ce qu'il ne remplace pas. Pas sur
 * le lecteur, une liste partagée ni les pages légales : il attend la page suivante (A11Y-07).
 */
export function WelcomeDialog() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (isQuietRoute(pathname)) return;
    try {
      if (!localStorage.getItem(KEY)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- décision prise après lecture du stockage local
        setOpen(true);
      }
    } catch {
      /* stockage indisponible : on n'insiste pas */
    }
  }, [pathname]);

  function close() {
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* stockage indisponible */
    }
    setOpen(false);
  }

  if (!open) return null;
  return <WelcomeDialogContent onClose={close} />;
}
