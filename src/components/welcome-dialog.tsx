"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
// Import direct voulu, pas de dynamic() : la fenêtre doit s'afficher dès le premier rendu (cf. commit 0a474b8).
import WelcomeDialogContent from "@/components/welcome-dialog-content";
import { isQuietRoute } from "@/lib/quiet-routes";
import { hasStored, writeStored } from "@/lib/client/storage";

const KEY = "sextant:welcomed";

/**
 * Message d'accueil affiché une seule fois par navigateur : ce que l'outil fait, et ce qu'il ne remplace pas. Pas sur
 * le lecteur, une liste partagée ni les pages légales : il attend la page suivante (A11Y-07).
 */
export function WelcomeDialog() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // Déjà vu, ou stockage indisponible (null) : on n'insiste pas.
    if (isQuietRoute(pathname) || hasStored(KEY) !== false) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- décision prise après lecture du stockage local ; l'ouverture reste acquise si la page suivante est « calme »
    setOpen(true);
  }, [pathname]);

  function close() {
    writeStored(KEY, String(Date.now()));
    setOpen(false);
  }

  if (!open) return null;
  return <WelcomeDialogContent onClose={close} />;
}
