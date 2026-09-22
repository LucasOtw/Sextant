import { cn } from "cn";

/**
 * Marque Sourcier : une baguette de sourcier (le Y) qui pointe vers la source (le point).
 * Trait en `currentColor`, à poser sur un fond contrasté.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={cn("size-5", className)}>
      <path d="M9 7.5 16 16.5 23 7.5" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 16.5v5" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
      <circle cx="16" cy="25.5" r="2.3" fill="currentColor" />
    </svg>
  );
}
