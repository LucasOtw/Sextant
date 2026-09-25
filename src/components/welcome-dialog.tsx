"use client";

import { useEffect, useState } from "react";
// Import direct voulu, pas de dynamic() : la fenêtre doit s'afficher dès le premier rendu (cf. commit 0a474b8).
import WelcomeDialogContent from "@/components/welcome-dialog-content";

const KEY = "sextant:welcomed";

/** Message d'accueil affiché une seule fois par navigateur : ce que l'outil fait, et ce qu'il ne remplace pas. */
export function WelcomeDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- décision prise après lecture du stockage local
        setOpen(true);
      }
    } catch {
      /* stockage indisponible : on n'insiste pas */
    }
  }, []);

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
