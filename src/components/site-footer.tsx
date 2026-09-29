import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { ExternalLink } from "@/components/external-link";
import { wavePath } from "@/components/scene";

const LINKS = [
  { href: "/a-propos", label: "À propos" },
  { href: "/retours", label: "Bugs et idées" },
  { href: "/mentions-legales", label: "Mentions légales" },
  { href: "/conditions", label: "Conditions d'utilisation" },
  { href: "/confidentialite", label: "Confidentialité" },
];

/**
 * Liseré supérieur du pied de page, en pixels (le viewBox est à l'échelle 1 jusqu'à 3 840 px de large, « slice » rogne
 * les côtés sur les écrans plus étroits) : demi-ondulations de 80 px, crêtes à ± 5 px, trait de 8 px. La crête déborde
 * du viewBox à gauche comme à droite : elle reste continue, sans bout visible, à toute largeur.
 */
export const FOOTER_WAVE = { width: 3840, height: 32, y: 14, period: 160, amplitude: 5, stroke: 8 } as const;

const { width, height, y, period, amplitude } = FOOTER_WAVE;
const CREST = wavePath(-period, y, period, amplitude, Math.ceil((width + 2 * period) / (period / 2)));

function FooterWave() {
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMax slice"
      aria-hidden
      className="-mb-px block h-8 w-full forced-colors:hidden"
    >
      <path d={`${CREST}V${height + 2}H${-period}Z`} className="fill-brand-surface" />
      <path d={CREST} fill="none" className="stroke-brand" strokeWidth={FOOTER_WAVE.stroke} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Pied de page en surface bleue (section forte, S3) : #3E54B8 en clair (il porte du texte courant), #27346F en sombre,
 * texte #EEF1FB, liens clairs soulignés au survol, focus blanc (.surface-brand). Séparé du contenu par une vague en
 * trait épais, son liseré supérieur. Le cadre du logo passe en couleur claire. En couleurs forcées, la vague disparaît
 * et un filet la remplace.
 */
export function SiteFooter() {
  return (
    <footer className="mt-12">
      <FooterWave />
      <div className="surface-brand forced-colors:border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 pb-8 pt-7 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Link href="/" prefetch={false} className="title-display flex items-center gap-2 self-start text-base sm:self-auto">
            <LogoMark className="size-6 text-brand-foreground" />
            Sextant
          </Link>
          <nav aria-label="Pied de page" className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} prefetch={false} className="footer-link">
                {l.label}
              </Link>
            ))}
            <ExternalLink href="https://openalex.org" className="footer-link">
              Données OpenAlex
            </ExternalLink>
          </nav>
          <p className="text-sm">© {new Date().getFullYear()} Sextant</p>
        </div>
      </div>
    </footer>
  );
}
