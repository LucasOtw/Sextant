import { cn } from "cn";

/**
 * Logo Sextant, en couleur : cadre encre (currentColor, donc lisible en clair et en sombre),
 * arc gradué doré, alidade bleue qui vise l'astre.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden className={cn("size-9", className)}>
      {/* arc gradué */}
      <path d="M12 44A36 36 0 0 0 52 44" stroke="#E0A52D" strokeWidth="5" strokeLinecap="round" />
      <path d="M22 49.5v-3.5M32 50v-4M42 49.5v-3.5" stroke="#8A5F14" strokeWidth="2" strokeLinecap="round" />
      {/* cadre */}
      <path d="M12 44 32 14 52 44" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* petit miroir sur le bras gauche */}
      <rect x="17" y="30" width="7" height="7" rx="1.5" transform="rotate(-56 20.5 33.5)" fill="#4F6FD8" />
      {/* alidade */}
      <path d="M32 14 44.3 47.8" stroke="#4F6FD8" strokeWidth="4" strokeLinecap="round" />
      <circle cx="32" cy="14" r="3.5" fill="#4F6FD8" />
      {/* astre */}
      <path d="M53 4l1.8 4.7L59.5 10.5l-4.7 1.8L53 17l-1.8-4.7L46.5 10.5l4.7-1.8z" fill="#E0A52D" />
    </svg>
  );
}
