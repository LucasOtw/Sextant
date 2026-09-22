"use client";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/logo";

/**
 * Contenu de la fenêtre d'accueil. Chargé à la demande par WelcomeDialog (uniquement à la première visite),
 * pour ne pas alourdir le premier chargement des visiteurs qui l'ont déjà vue.
 */
export default function WelcomeDialogContent({ onClose }: { onClose: () => void }) {
  return (
    // Fermeture uniquement par le bouton : ni clic à l'extérieur, ni touche Échap.
    <Dialog open onOpenChange={() => undefined} disablePointerDismissal>
      <DialogContent showCloseButton={false} className="overflow-hidden p-0 sm:max-w-md" onKeyDown={(e) => e.key === "Escape" && e.preventDefault()}>
        <WelcomeIllustration />
        <div className="flex flex-col gap-3 px-6 pb-6 pt-2">
          <DialogTitle className="title-display text-2xl">Un compagnon, pas un raccourci</DialogTitle>
          <DialogDescription className="text-[15px] leading-relaxed text-muted-foreground">
            Sextant vous aide à découvrir plus d'articles évalués par les pairs, de thèses et d'ouvrages, et à passer
            de l'un à l'autre. Il ne remplace pas vos propres recherches sur Google Scholar, les bases spécialisées
            de votre discipline ou le catalogue de votre bibliothèque : il s'y ajoute.
          </DialogDescription>
          <ul className="grid gap-1.5 text-[15px]">
            <li className="flex gap-2"><span className="text-accent-brand" aria-hidden>●</span> Croisez toujours plusieurs sources.</li>
            <li className="flex gap-2"><span className="text-accent-brand" aria-hidden>●</span> Lisez l'article, pas seulement sa synthèse.</li>
            <li className="flex gap-2"><span className="text-accent-brand" aria-hidden>●</span> Les métadonnées viennent d'OpenAlex et peuvent comporter des erreurs.</li>
          </ul>
          <Button onClick={onClose} size="lg" className="mt-2 w-full">Compris, je me lance</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Illustration : le sextant vise une constellation d'articles au-dessus d'une mer calme. */
function WelcomeIllustration() {
  return (
    <div className="relative flex h-44 items-end justify-center overflow-hidden bg-[oklch(0.94_0.03_250)] dark:bg-[oklch(0.28_0.05_250)]">
      <svg viewBox="0 0 400 176" className="absolute inset-0 h-full w-full" aria-hidden>
        {/* étoiles / articles */}
        <g fill="#E0A52D">
          <circle cx="70" cy="40" r="3" /><circle cx="130" cy="24" r="2" /><circle cx="330" cy="30" r="3" />
          <circle cx="290" cy="60" r="2" /><circle cx="360" cy="80" r="2.5" /><circle cx="40" cy="90" r="2" />
        </g>
        <g stroke="#E0A52D" strokeOpacity="0.5" strokeWidth="1.2">
          <path d="M70 40 130 24M130 24 200 46M290 60 330 30M330 30 360 80" />
        </g>
        {/* fiches d'articles flottantes */}
        <g>
          <rect x="228" y="34" width="52" height="34" rx="5" fill="#fff" stroke="#4F6FD8" strokeWidth="1.5" />
          <rect x="236" y="43" width="30" height="3" rx="1.5" fill="#4F6FD8" />
          <rect x="236" y="51" width="36" height="3" rx="1.5" fill="#B8C4EE" />
          <rect x="236" y="58" width="22" height="3" rx="1.5" fill="#B8C4EE" />
          <rect x="88" y="62" width="52" height="34" rx="5" fill="#fff" stroke="#4F6FD8" strokeWidth="1.5" transform="rotate(-8 114 79)" />
          <rect x="96" y="71" width="30" height="3" rx="1.5" fill="#4F6FD8" transform="rotate(-8 114 79)" />
          <rect x="96" y="79" width="36" height="3" rx="1.5" fill="#B8C4EE" transform="rotate(-8 114 79)" />
        </g>
        {/* mer */}
        <path d="M0 150c40-10 80-10 120 0s80 10 120 0 80-10 120 0 40 6 40 6v20H0z" fill="#4F6FD8" fillOpacity="0.25" />
        <path d="M0 160c40-8 80-8 120 0s80 8 120 0 80-8 120 0 40 5 40 5v11H0z" fill="#4F6FD8" fillOpacity="0.4" />
      </svg>
      <LogoMark className="relative mb-6 size-24 text-[#1D1F2A] drop-shadow-sm dark:text-[#F7F5EF]" />
    </div>
  );
}
