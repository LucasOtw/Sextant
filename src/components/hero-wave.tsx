import { wavePath } from "@/components/scene";
import { cn } from "@/lib/cn";

// Quatre demi-ondulations amples de 46 unités entre x = 8 et x = 192 : la marge de 8 laisse la place aux bouts arrondis.
const HERO_WAVE = wavePath(8, 14, 92, 6, 4);

/**
 * Vague du bas du hero : trait épais aux bouts arrondis, en jaune (le jaune est réservé à l'étoile et à la vague).
 * Largeur fixe, centrée : elle reste dans son conteneur à toute largeur d'écran. Décorative ; en couleurs forcées, masquée.
 */
export function HeroWave({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 28" aria-hidden className={cn("h-auto w-44 shrink-0 sm:w-56 forced-colors:hidden", className)}>
      <path d={HERO_WAVE} fill="none" className="stroke-sun" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
