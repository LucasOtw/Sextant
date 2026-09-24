"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const McpAnnouncementContent = dynamic(() => import("@/components/mcp-announcement-content"), { ssr: false });

const KEY = "sextant:announce-mcp";
const WELCOME_KEY = "sextant:welcomed";

/**
 * Annonce du serveur MCP, une seule fois par navigateur. Jamais au premier passage (le message d'accueil a la priorité,
 * et deux fenêtres d'affilée seraient pénibles), ni sur les pages où elle gênerait (compte, lecteur, liste partagée).
 */
export function McpAnnouncement() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (/^\/(compte|liste\/|article\/[^/]+\/lire)/.test(pathname)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (localStorage.getItem(WELCOME_KEY) && !localStorage.getItem(KEY)) timer = setTimeout(() => setOpen(true), 900);
    } catch {
      /* stockage indisponible : on n'insiste pas */
    }
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- décidé une fois, à l'arrivée sur le site
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
  return <McpAnnouncementContent onClose={close} />;
}
