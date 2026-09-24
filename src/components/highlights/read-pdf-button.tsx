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
        // Seul un « non relayable » explicite renvoie vers l'hébergeur. Un refus de débit (429) ou une panne (503)
        // ne dit rien du PDF : on garde le lecteur intégré, qui gère lui-même l'échec.
        if (res.headers.get("x-sextant-readable") === "0") setTarget("original");
      })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [workId]);

  if (target === "original") {
    return (
      <a href={originalUrl} target="_blank" rel="noreferrer" className={buttonVariants({ size: "lg", className })} title="Le lecteur intégré ne peut pas récupérer ce PDF : il s'ouvre chez son hébergeur.">
        <FileTextIcon /> Lire le PDF <ExternalLinkIcon data-icon="inline-end" aria-hidden />
        {/* Le title n'apparaît qu'au survol : l'ouverture dans un nouvel onglet est aussi dite aux lecteurs d'écran. */}
        <span className="sr-only">(s&apos;ouvre chez l&apos;hébergeur, dans un nouvel onglet)</span>
      </a>
    );
  }
  return (
    <Link href={`/article/${workId}/lire`} className={buttonVariants({ size: "lg", className })}>
      <FileTextIcon /> Lire le PDF
    </Link>
  );
}
