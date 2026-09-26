"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { isTypingTarget } from "@/lib/focus";
import { isQuietRoute } from "@/lib/quiet-routes";
import { hasStored, writeStored } from "@/lib/client/storage";

const McpAnnouncementContent = dynamic(() => import("@/components/mcp-announcement-content"), { ssr: false });

const KEY = "sextant:announce-mcp";
const WELCOME_KEY = "sextant:welcomed";

/** Délai avant l'annonce : la page a le temps de s'installer. */
const DELAY_MS = 900;

/**
 * Annonce du serveur MCP, une seule fois par navigateur. Jamais au premier passage (le message d'accueil a la priorité,
 * et deux fenêtres d'affilée seraient pénibles), ni sur les pages où elle gênerait (compte, lecteur, liste partagée,
 * pages légales : lib/quiet-routes.ts).
 *
 * Elle ne s'impose pas à quelqu'un qui a déjà commencé (A11Y-28) : une frappe, une saisie ou un clic avant son
 * ouverture l'annule, de même qu'un champ de saisie qui a le focus au moment de l'ouvrir. Rien n'est alors noté : elle
 * sera proposée à la visite suivante.
 */
export function McpAnnouncement() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (pathname.startsWith("/compte") || isQuietRoute(pathname)) return;
    // Accueil pas encore vu, annonce déjà vue, ou stockage indisponible (null) : on n'insiste pas.
    if (hasStored(WELCOME_KEY) !== true || hasStored(KEY) !== false) return;
    const events = ["keydown", "input", "pointerdown"] as const;
    let cancelled = false;
    const timer = setTimeout(() => {
      // Contenu chargé avant d'ouvrir ; l'écoute continue pendant le téléchargement.
      import("@/components/mcp-announcement-content")
        .then(() => {
          if (cancelled) return;
          cancel();
          if (!isTypingTarget(document.activeElement)) setOpen(true);
        })
        .catch(() => cancel()); /* chargement impossible (hors ligne) : pas d'annonce cette fois */
    }, DELAY_MS);
    function cancel() {
      cancelled = true;
      clearTimeout(timer);
      events.forEach((type) => window.removeEventListener(type, cancel, true));
    }
    events.forEach((type) => window.addEventListener(type, cancel, { capture: true, once: true }));
    return cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- décidé une fois, à l'arrivée sur le site
  }, []);

  function close() {
    writeStored(KEY, String(Date.now()));
    setOpen(false);
  }

  if (!open) return null;
  return <McpAnnouncementContent onClose={close} />;
}
