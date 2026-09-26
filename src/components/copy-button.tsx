"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/hooks/use-copy";

interface Props {
  text: string;
  label: string;
  /** Message lu aux lecteurs d'écran après la copie (ex. « Référence APA copiée. »). */
  message?: string;
  variant?: "outline" | "ghost" | "secondary";
  size?: "sm" | "default" | "lg";
  className?: string;
}

export function CopyButton({ text, label, message, variant = "outline", size = "sm", className }: Props) {
  // Presse-papiers indisponible : rien à faire (pas de message d'erreur).
  const { copied, copy } = useCopy();
  return (
    <Button variant={variant} size={size} className={className} onClick={() => void copy(text, { message })}>
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? "Copié" : label}
    </Button>
  );
}
