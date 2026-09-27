import { ASTRE, ASTRE_CENTER } from "@/components/logo";
import { wavePath } from "@/components/scene";
import { cn } from "@/lib/cn";

/**
 * Géométrie du bas du hero, en unités du viewBox. Cinq demi-ondulations de 40 unités (crête, creux, crête, creux, crête)
 * entre x = 8 et x = 208 ; la marge de 8 laisse la place aux bouts arrondis. L'étoile se lève au bout de la vague.
 */
export const HERO_VIEWBOX = { width: 240, height: 38 } as const;
export const HERO_WAVE_GEOMETRY = { x0: 8, y: 26, period: 80, amplitude: 6, count: 5 } as const;
export const HERO_STAR = { cx: 224, cy: 12, scale: 0.85 } as const;
/** Épaisseur du trait, en pixels à l'écran (le trait ne suit pas l'échelle du dessin) : mobile, puis à partir de sm. */
export const HERO_STROKE_PX = { base: 8, sm: 11 } as const;

const { x0, y, period, amplitude, count } = HERO_WAVE_GEOMETRY;
const HERO_WAVE = wavePath(x0, y, period, amplitude, count);
const STAR_TRANSFORM = `translate(${HERO_STAR.cx} ${HERO_STAR.cy}) scale(${HERO_STAR.scale}) translate(${-ASTRE_CENTER[0]} ${-ASTRE_CENTER[1]})`;

/**
 * Bas du hero : vague en trait épais aux bouts arrondis et petite étoile à quatre branches (le dessin de l'astre du logo),
 * toutes deux en jaune --sun. C'est la seule étoile décorative du site. Environ 65 % de la largeur du bloc de recherche,
 * bornée à 28 rem, centrée : elle reste dans son conteneur à toute largeur. Le trait garde son épaisseur en pixels quelle
 * que soit la largeur (non-scaling-stroke), pour ne pas s'affiner sur mobile. Décorative ; en couleurs forcées, masquée.
 */
export function HeroWave({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${HERO_VIEWBOX.width} ${HERO_VIEWBOX.height}`}
      aria-hidden
      className={cn("h-auto w-[65%] max-w-md shrink-0 forced-colors:hidden", className)}
    >
      <path
        d={HERO_WAVE}
        fill="none"
        vectorEffect="non-scaling-stroke"
        className="stroke-sun stroke-8 sm:stroke-11"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d={ASTRE} transform={STAR_TRANSFORM} className="fill-sun" />
    </svg>
  );
}
