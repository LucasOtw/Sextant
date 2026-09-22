"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const KEY = "sextant:welcomed";

/** Le contenu (Dialog, illustration) n'est téléchargé que si la fenêtre doit s'afficher. */
const WelcomeDialogContent = dynamic(() => import("@/components/welcome-dialog-content"), { ssr: false });

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
