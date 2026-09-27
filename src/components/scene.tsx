import { cn } from "@/lib/cn";

/**
 * Tracé d'une vague : `count` demi-ondulations de `period / 2` chacune, à partir de (x0, y), crêtes à ± `amplitude`.
 * Courbes quadratiques enchaînées (« t » reprend le point de contrôle en miroir) : les creux et les bosses alternent.
 */
export function wavePath(x0: number, y: number, period: number, amplitude: number, count: number) {
  const half = period / 2;
  return `M${x0} ${y}q${half / 2} ${-2 * amplitude} ${half} 0` + ` t${half} 0`.repeat(Math.max(0, count - 1));
}

/**
 * Fond commun des illustrations (pages d'erreur, fenêtre d'accueil, annonce MCP) : zone teintée, dessin posé dans un
 * SVG qui remplit toute la zone (« slice » : aucun bord vide, quelle que soit la largeur), puis le premier plan (le
 * logo). Tout est en tokens, donc juste en clair comme en sombre. Décoratif.
 */
export function Scene({
  viewBox,
  art,
  className,
  children,
}: {
  viewBox: string;
  /** Dessin de fond, en coordonnées du viewBox. */
  art: React.ReactNode;
  className?: string;
  /** Premier plan, en HTML (logo, cartes). */
  children?: React.ReactNode;
}) {
  return (
    <div aria-hidden className={cn("relative flex justify-center overflow-hidden bg-tint", className)}>
      <svg viewBox={viewBox} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full">
        {art}
      </svg>
      {children}
    </div>
  );
}

/**
 * Mer d'une scène : un aplat léger surmonté d'une crête en trait épais aux bouts arrondis, en bleu de marque.
 * Déborde du viewBox à gauche comme à droite : la crête reste continue, sans bout visible, à toute largeur.
 */
export function Sea({ width, height, y, period, amplitude }: { width: number; height: number; y: number; period: number; amplitude: number }) {
  const x0 = -period;
  const count = Math.ceil((width - x0 + period) / (period / 2));
  const crest = wavePath(x0, y, period, amplitude, count);
  return (
    <>
      <path d={`${crest}V${height + 10}H${x0}Z`} className="fill-brand" fillOpacity={0.16} />
      <path d={crest} fill="none" className="stroke-brand" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}

/** Constellation : points et filets en bleu de marque, opaques pour les points (le jaune reste à l'astre du logo). */
export function Constellation({ stars, links }: { stars: [number, number, number][]; links: string }) {
  return (
    <>
      <path d={links} fill="none" className="stroke-brand" strokeOpacity={0.45} strokeWidth={1.5} strokeLinecap="round" />
      <g className="fill-brand">
        {stars.map(([cx, cy, r]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
        ))}
      </g>
    </>
  );
}
