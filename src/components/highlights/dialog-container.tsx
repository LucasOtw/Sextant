"use client";

import { createContext, useContext, type RefObject } from "react";

/**
 * Élément où monter les fenêtres des surlignages. En plein écran natif, seul le sous-arbre de l'élément en plein écran
 * s'affiche : une fenêtre ajoutée à `<body>` serait invisible mais garderait le focus. Le lecteur fournit ici son
 * conteneur pendant le plein écran ; ailleurs, rien (fenêtre dans `<body>`).
 */
export const DialogContainerContext = createContext<RefObject<HTMLElement | null> | undefined>(undefined);

export function useDialogContainer() {
  return useContext(DialogContainerContext);
}
