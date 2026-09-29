import { cn } from "@/lib/cn";

/**
 * Astre du logo : étoile à quatre branches de 13 unités, centrée en (53, 10,5). Même dessin pour l'étoile du hero, la
 * seule étoile décorative du site (hero-wave.tsx).
 */
export const ASTRE = "M53 4l1.8 4.7L59.5 10.5l-4.7 1.8L53 17l-1.8-4.7L46.5 10.5l4.7-1.8z";
export const ASTRE_CENTER = [53, 10.5] as const;

/**
 * Logo Sextant, aux couleurs de la DA (M10) : cadre en currentColor (encre en clair, crème en sombre), alidade, miroir
 * et pivot en bleu de marque (--brand : #566ED1, #6F8BE8 en sombre), arc gradué et astre en jaune (--sun #D7A848),
 * graduations en jaune sombre accordé (--sun-deep). Géométrie de référence, reprise par public/icon.svg, les PNG et
 * l'image de partage (scripts/generate-icons.mjs, scripts/og-image.html).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden className={cn("size-9", className)}>
      {/* arc gradué */}
      <path d="M12 44A36 36 0 0 0 52 44" className="stroke-sun" strokeWidth="5" strokeLinecap="round" />
      <path d="M22 49.5v-3.5M32 50v-4M42 49.5v-3.5" className="stroke-sun-deep" strokeWidth="2" strokeLinecap="round" />
      {/* cadre */}
      <path d="M12 44 32 14 52 44" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* petit miroir sur le bras gauche */}
      <rect x="17" y="30" width="7" height="7" rx="1.5" transform="rotate(-56 20.5 33.5)" className="fill-brand" />
      {/* alidade */}
      <path d="M32 14 44.3 47.8" className="stroke-brand" strokeWidth="4" strokeLinecap="round" />
      <circle cx="32" cy="14" r="3.5" className="fill-brand" />
      {/* astre */}
      <path d={ASTRE} className="fill-sun" />
    </svg>
  );
}
