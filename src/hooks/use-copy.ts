"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { copyText } from "@/lib/announce";

/** Durée pendant laquelle le bouton affiche « Copié ». */
const COPIED_MS = 1800;

interface CopyOptions {
  /** Message lu aux lecteurs d'écran après la copie. */
  message?: string;
  /** Presse-papiers indisponible : message d'erreur affiché (toast). Sans lui, l'échec est silencieux. */
  failure?: string;
}

/**
 * Copie dans le presse-papiers avec un état « Copié » temporaire pour le bouton, et une annonce aux lecteurs d'écran
 * (le changement de texte d'un bouton ne l'est pas de façon fiable, A11Y-13). Logique commune des boutons de copie.
 */
export function useCopy() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(async (text: string, { message, failure }: CopyOptions = {}): Promise<boolean> => {
    const ok = await copyText(text, message);
    if (!ok) {
      if (failure) toast.error(failure);
      return false;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    return true;
  }, []);

  return { copied, copy };
}
