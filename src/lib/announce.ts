/**
 * Annonces aux lecteurs d'écran (WCAG 4.1.3) : un message d'état (« Copié », nombre de résultats…) est écrit dans une
 * région `aria-live` montée vide une fois pour toutes dans la mise en page (src/app/layout.tsx). Une région insérée
 * déjà remplie, ou le simple changement du texte d'un bouton, n'est pas lue de façon fiable.
 *
 * La région porte `aria-live` en attribut explicite : Base UI masque (aria-hidden) tout ce qui entoure une boîte de
 * dialogue ouverte, sauf les éléments `[aria-live]`. Une copie faite dans une boîte de dialogue reste donc annoncée.
 */
export const ANNOUNCER_ID = "sr-announcer";

/** Délai entre l'effacement et l'écriture : un message identique au précédent est relu. */
const RESET_MS = 100;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Fait lire `message` par les lecteurs d'écran (poliment : après la phrase en cours). Sans région, rien. */
export function announce(message: string): void {
  if (typeof document === "undefined") return;
  const region = document.getElementById(ANNOUNCER_ID);
  if (!region) return;
  clearTimeout(timer);
  region.textContent = "";
  timer = setTimeout(() => {
    region.textContent = message;
  }, RESET_MS);
}

/** Copie `text` dans le presse-papiers et l'annonce ; false si le presse-papiers est indisponible (rien n'est annoncé). */
export async function copyText(text: string, message = "Copié dans le presse-papiers."): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    return false;
  }
  announce(message);
  return true;
}
