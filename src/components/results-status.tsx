"use client";

import { useEffect } from "react";
import Link from "next/link";
import { announce } from "@/lib/announce";

/** Cible du focus après un changement de page : le titre de la liste (ou le message qui la remplace). */
export const RESULTS_ID = "resultats";

/**
 * Posé par un lien qui remplace la liste (pagination, « Réessayer ») : ce lien disparaît avec la liste qu'il remplace,
 * et le focus retomberait sur la page. Consommé par la liste suivante, qui prend alors le focus, seulement si elle est
 * celle de l'adresse visée et arrive dans les 10 s : une demande restée en suspens (navigation abandonnée) ne déplace
 * pas le focus plus tard, après un retour arrière par exemple. Un chargement direct ou un retour arrière n'en posent
 * pas : le focus n'est jamais déplacé sans action dans la liste.
 */
let focusRequest: { url: string; at: number } | null = null;
const FOCUS_REQUEST_MS = 10_000;

function takeFocusRequest(): boolean {
  const request = focusRequest;
  focusRequest = null;
  return request !== null && Date.now() - request.at < FOCUS_REQUEST_MS && request.url === location.pathname + location.search;
}

/**
 * Annonce l'arrivée d'une liste de résultats (nombre, page) aux lecteurs d'écran, après une recherche, un filtre ou un
 * tri (WCAG 4.1.3, A11Y-12). Monté avec chaque liste : la liste est remontée à chaque changement de paramètres
 * (Suspense à clé), et un message d'erreur à chaque réponse (clé propre), l'annonce part donc à chaque nouvelle liste.
 * Après la pagination ou « Réessayer », le titre de la liste prend le focus et se lit lui-même (nombre et page) :
 * pas d'annonce en plus, qui répéterait la même information.
 */
export function ResultsStatus({ message }: { message: string }) {
  useEffect(() => {
    // Seulement si le focus a été perdu (lien démonté) : un utilisateur qui est allé ailleurs le garde.
    const lost = !document.activeElement || document.activeElement === document.body;
    const target = takeFocusRequest() && lost ? document.getElementById(RESULTS_ID) : null;
    // Sans défilement : Next a déjà remonté la page en haut, le titre de la liste est juste en dessous.
    if (target) target.focus({ preventScroll: true });
    // Titre déjà focalisé par ce montage (second passage de l'effet en mode strict) : il s'est déjà lu.
    else if (document.activeElement?.id !== RESULTS_ID) announce(message);
  }, [message]);
  return null;
}

/** Lien qui remplace la liste de résultats (pagination, « Réessayer ») : la liste suivante prendra le focus. */
export function ResultsLink(props: React.ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      onClick={(e) => {
        const href = typeof props.href === "string" ? new URL(props.href, location.href) : null;
        focusRequest = href ? { url: href.pathname + href.search, at: Date.now() } : null;
        props.onClick?.(e);
      }}
    />
  );
}
