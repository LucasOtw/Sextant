"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLinkIcon, FileTextIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

interface Props {
  workId: string;
  originalUrl: string;
  className?: string;
}

/**
 * « Lire le PDF » : mène au lecteur intégré, sauf si le relais ne peut pas récupérer la copie libre (hébergeur qui refuse
 * les serveurs) — on le sait par une sonde légère et mise en cache, et le bouton ouvre alors le PDF chez son hébergeur.
 */
export function ReadPdfButton({ workId, originalUrl, className }: Props) {
  const [target, setTarget] = useState<"reader" | "original">("reader");

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/pdf?work=${workId}`, { method: "HEAD", signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) setTarget("original");
      })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [workId]);

  if (target === "original") {
    return (
      <a href={originalUrl} target="_blank" rel="noreferrer" className={buttonVariants({ size: "lg", className })} title="Le lecteur intégré ne peut pas récupérer ce PDF : il s'ouvre chez son hébergeur.">
        <FileTextIcon /> Lire le PDF <ExternalLinkIcon data-icon="inline-end" />
      </a>
    );
  }
  return (
    <Link href={`/article/${workId}/lire`} className={buttonVariants({ size: "lg", className })}>
      <FileTextIcon /> Lire le PDF
    </Link>
  );
}
