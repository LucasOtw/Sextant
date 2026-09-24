import { LogoMark } from "@/components/logo";
import { cn } from "cn";

interface Props {
  /** `lost` : la page a pris le large (404). `storm` : mer agitée (erreur serveur). */
  variant: "lost" | "storm";
  /** Grand repère en filigrane (« 404 »). */
  code?: string;
  className?: string;
}

/** Illustration des pages d'erreur : le sextant sur la mer, par temps clair ou agité. Décorative. */
export function ErrorScene({ variant, code, className }: Props) {
  const storm = variant === "storm";
  return (
    <div
      aria-hidden
      className={cn(
        "relative flex h-48 items-end justify-center overflow-hidden rounded-2xl sm:h-56",
        storm ? "bg-[oklch(0.9_0.02_250)] dark:bg-[oklch(0.24_0.03_250)]" : "bg-[oklch(0.94_0.03_250)] dark:bg-[oklch(0.28_0.05_250)]",
        className,
      )}
    >
      {code && (
        <span className="title-display pointer-events-none absolute inset-x-0 top-3 select-none text-center text-[6.5rem] leading-none text-[#4F6FD8]/15 sm:top-2 sm:text-[8.5rem] dark:text-white/10">
          {code}
        </span>
      )}
      <svg viewBox="0 0 480 224" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        {storm ? (
          <>
            {/* nuages */}
            <g fill="#8EA0D8" fillOpacity="0.45">
              <ellipse cx="110" cy="52" rx="62" ry="20" /><ellipse cx="150" cy="40" rx="40" ry="22" /><ellipse cx="80" cy="44" rx="30" ry="16" />
              <ellipse cx="360" cy="46" rx="70" ry="22" /><ellipse cx="400" cy="34" rx="42" ry="22" /><ellipse cx="330" cy="36" rx="30" ry="15" />
            </g>
            {/* éclair */}
            <path d="M372 66 358 98h14l-10 30 26-40h-15l10-22z" fill="#E0A52D" />
            {/* pluie */}
            <g stroke="#4F6FD8" strokeOpacity="0.35" strokeWidth="2" strokeLinecap="round">
              <path d="M70 80l-6 16M98 86l-6 16M126 78l-6 16M154 88l-6 16M320 82l-6 16M346 92l-6 16M420 84l-6 16M446 94l-6 16" />
            </g>
            {/* houle forte */}
            <path d="M0 176c30-26 60-26 90 0s60 26 90 0 60-26 90 0 60 26 90 0 60-26 90 0 30 13 30 13v35H0z" fill="#4F6FD8" fillOpacity="0.28" />
            <path d="M0 192c30-18 60-18 90 0s60 18 90 0 60-18 90 0 60 18 90 0 60-18 90 0 30 9 30 9v24H0z" fill="#4F6FD8" fillOpacity="0.45" />
          </>
        ) : (
          <>
            {/* constellation, une étoile manque à l'appel */}
            <g fill="#E0A52D">
              <circle cx="60" cy="46" r="3" /><circle cx="118" cy="30" r="2.5" /><circle cx="176" cy="58" r="2" />
              <circle cx="330" cy="36" r="3" /><circle cx="400" cy="62" r="2.5" />
            </g>
            <g stroke="#E0A52D" strokeOpacity="0.5" strokeWidth="1.2">
              <path d="M60 46 118 30M118 30 176 58M330 36 400 62" />
              <path d="M400 62 440 34" strokeDasharray="3 5" />
            </g>
            <circle cx="446" cy="30" r="9" fill="none" stroke="#E0A52D" strokeWidth="1.5" strokeDasharray="3 4" />
            <text x="446" y="35" textAnchor="middle" fontSize="12" fontWeight="700" fill="#E0A52D">?</text>
            {/* bouteille à la mer */}
            <g transform="rotate(-18 392 170)">
              <rect x="378" y="160" width="30" height="14" rx="6" fill="#fff" fillOpacity="0.85" stroke="#4F6FD8" strokeWidth="1.5" />
              <rect x="406" y="163" width="8" height="8" rx="2" fill="#E0A52D" />
            </g>
            {/* mer calme */}
            <path d="M0 184c40-10 80-10 120 0s80 10 120 0 80-10 120 0 80 10 120 0v40H0z" fill="#4F6FD8" fillOpacity="0.22" />
            <path d="M0 198c40-8 80-8 120 0s80 8 120 0 80-8 120 0 80 8 120 0v26H0z" fill="#4F6FD8" fillOpacity="0.38" />
          </>
        )}
      </svg>
      <LogoMark
        className={cn(
          "relative mb-8 size-20 text-[#1D1F2A] drop-shadow-sm sm:size-24 dark:text-[#F7F5EF]",
          storm ? "motion-safe:animate-[sextant-roll_3.2s_ease-in-out_infinite]" : "motion-safe:animate-[sextant-bob_4s_ease-in-out_infinite]",
        )}
      />
    </div>
  );
}
