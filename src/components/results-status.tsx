"use client";

import { useEffect } from "react";
import Link from "next/link";
import { announce } from "@/lib/announce";

/** Cible du focus après un changement de page : le titre de la liste (ou le message qui la remplace). */
export const RESULTS_ID = "resultats";

/**
 * Posé par un lien qui remplace la liste (pagination, « Réessayer ») : ce lien disparaît pendant le chargement, et le
 * focus retomberait sur la page. Consommé à l'arrivée de la liste suivante, qui prend alors le focus. Un chargement
 * direct ou un retour arrière ne le posent pas : le focus n'est jamais déplacé sans action dans la liste.
 */
let focusRequested = false;

/**
 * Annonce l'arrivée d'une liste de résultats (nombre, page) aux lecteurs d'écran, après une recherche, un filtre, un
 * tri ou un changement de page (WCAG 4.1.3, A11Y-12). Monté avec chaque liste : la liste est remontée à chaque
 * changement de paramètres (Suspense à clé), l'annonce part donc à chaque nouvelle liste.
 */
export function ResultsStatus({ message }: { message: string }) {
  useEffect(() => {
    announce(message);
    if (!focusRequested) return;
    focusRequested = false;
    // Seulement si le focus a été perdu (lien démonté) : un utilisateur qui est allé ailleurs le garde.
    if (document.activeElement && document.activeElement !== document.body) return;
    // Sans défilement : Next a déjà remonté la page en haut, le titre de la liste est juste en dessous.
    document.getElementById(RESULTS_ID)?.focus({ preventScroll: true });
  }, [message]);
  return null;
}

/** Lien qui remplace la liste de résultats (pagination, « Réessayer ») : la liste suivante prendra le focus. */
export function ResultsLink(props: React.ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      onClick={(e) => {
        focusRequested = true;
        props.onClick?.(e);
      }}
    />
  );
}
