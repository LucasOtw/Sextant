import { LogoMark } from "@/components/logo";
import { Constellation, Scene, Sea } from "@/components/scene";
import { cn } from "@/lib/cn";

interface Props {
  /** `lost` : la page a pris le large (404). `storm` : mer agitée (erreur serveur). */
  variant: "lost" | "storm";
  /** Grand repère en filigrane (« 404 »). */
  code?: string;
  className?: string;
}

/** Illustration des pages d'erreur : le sextant sur la mer, par temps clair ou agité. Décorative et immobile. */
export function ErrorScene({ variant, code, className }: Props) {
  const storm = variant === "storm";
  return (
    <Scene
      viewBox="0 0 480 224"
      className={cn("h-48 items-end rounded-3xl sm:h-56", className)}
      art={
        storm ? (
          <>
            {/* nuages */}
            <g className="fill-brand" fillOpacity={0.3}>
              <ellipse cx="110" cy="52" rx="62" ry="20" /><ellipse cx="150" cy="40" rx="40" ry="22" /><ellipse cx="80" cy="44" rx="30" ry="16" />
              <ellipse cx="360" cy="46" rx="70" ry="22" /><ellipse cx="400" cy="34" rx="42" ry="22" /><ellipse cx="330" cy="36" rx="30" ry="15" />
            </g>
            {/* éclair, à l'encre : le jaune reste à l'astre du logo */}
            <path d="M372 66 358 98h14l-10 30 26-40h-15l10-22z" className="fill-foreground" />
            {/* pluie */}
            <path
              d="M70 80l-6 16M98 86l-6 16M126 78l-6 16M154 88l-6 16M320 82l-6 16M346 92l-6 16M420 84l-6 16M446 94l-6 16"
              className="stroke-brand"
              strokeOpacity={0.45}
              strokeWidth={2}
              strokeLinecap="round"
            />
            {/* houle forte */}
            <Sea width={480} height={224} y={176} period={100} amplitude={12} />
          </>
        ) : (
          <>
            {/* constellation, une étoile manque à l'appel */}
            <Constellation
              stars={[[60, 46, 3], [118, 30, 2.5], [176, 58, 2], [330, 36, 3], [400, 62, 2.5]]}
              links="M60 46 118 30M118 30 176 58M330 36 400 62"
            />
            <g className="stroke-brand" fill="none" strokeWidth={1.5} strokeLinecap="round">
              <path d="M400 62 440 34" strokeOpacity={0.45} strokeDasharray="3 5" />
              <circle cx="446" cy="30" r="9" strokeDasharray="3 4" />
            </g>
            <text x="446" y="35" textAnchor="middle" fontSize="12" fontWeight="700" className="fill-brand">?</text>
            {/* bouteille à la mer */}
            <g transform="rotate(-18 392 172)">
              <rect x="378" y="165" width="30" height="14" rx="6" className="fill-card stroke-brand" strokeWidth={1.5} />
              <rect x="406" y="168" width="8" height="8" rx="2" className="fill-brand" />
            </g>
            {/* mer calme */}
            <Sea width={480} height={224} y={178} period={140} amplitude={5} />
          </>
        )
      }
    >
      {code && (
        <span className="title-display pointer-events-none absolute inset-x-0 top-3 select-none text-center text-[6.5rem] leading-none text-brand/15 sm:top-2 sm:text-[8.5rem] dark:text-brand/25">
          {code}
        </span>
      )}
      {/* Sextant immobile : penché sur la houle, à peine incliné par temps clair. */}
      <LogoMark className={cn("relative mb-8 size-20 text-foreground sm:size-24", storm ? "-rotate-9" : "-rotate-3")} />
    </Scene>
  );
}
