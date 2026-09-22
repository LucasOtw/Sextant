"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  text: string;
  label: string;
  variant?: "outline" | "ghost" | "secondary";
}

export function CopyButton({ text, label, variant = "outline" }: Props) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant={variant}
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          /* presse-papiers indisponible : rien à faire */
        }
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? "Copié" : label}
    </Button>
  );
}
