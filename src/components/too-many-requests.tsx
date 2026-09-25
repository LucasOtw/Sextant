import { HourglassIcon } from "lucide-react";
import { cn } from "cn";

/**
 * Refus lisible d'une page rendue côté serveur quand la limite de débit est atteinte (une page ne peut pas répondre 429 :
 * le flux est déjà parti en 200). Le contenu n'est pas lu : c'est tout l'intérêt de la limite.
 */
export function TooManyRequests({ className }: { className?: string }) {
  return (
    <div role="status" className={cn("rounded-xl border border-dashed p-10 text-center", className)}>
      <HourglassIcon className="mx-auto size-8 text-accent-brand" aria-hidden />
      <p className="mt-3 text-lg font-medium">Beaucoup de visites en peu de temps</p>
      <p className="mx-auto mt-1 max-w-md text-balance text-muted-foreground">
        Pour protéger le service, cette page est momentanément limitée. Patientez une minute, puis rechargez la page.
      </p>
    </div>
  );
}
