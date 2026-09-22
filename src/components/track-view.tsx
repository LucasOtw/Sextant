"use client";

import { useEffect } from "react";
import { pushRecent, type RecentWork } from "@/lib/recent";

/** Enregistre la consultation d'un article dans l'historique local. Ne rend rien. */
export function TrackView(props: Omit<RecentWork, "viewedAt">) {
  useEffect(() => {
    pushRecent(props);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une consultation par identifiant
  }, [props.id]);
  return null;
}
