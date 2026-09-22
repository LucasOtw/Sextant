import { cn } from "cn";

/**
 * Marque Sextant : le cadre triangulaire, l'arc gradué et l'alidade qui vise l'astre.
 * Trait en `currentColor`, à poser sur un fond contrasté.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={cn("size-5", className)}>
      <path d="M6.8 17.2 16 8l9.2 9.2" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.8 17.2A13 13 0 0 0 25.2 17.2" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M16 8l3.6 12.4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="24" cy="6" r="1.8" fill="currentColor" />
    </svg>
  );
}
