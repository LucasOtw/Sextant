"use client";

import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/logo";
import { Constellation, Scene } from "@/components/scene";

/**
 * Contenu de la fenêtre d'accueil, importé directement par WelcomeDialog : le chargement différé retardait
 * l'affichage à la première visite (Speed Index mobile, cf. commit 0a474b8).
 */
export default function WelcomeDialogContent({ onClose }: { onClose: () => void }) {
  return (
    // Se ferme comme toute boîte de dialogue : le bouton, Échap ou un clic à l'extérieur, qui valent tous « vu » (A11Y-07).
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="overflow-y-auto p-0 sm:p-0 sm:max-w-md">
        <WelcomeIllustration />
        <div className="flex flex-col gap-3 px-6 pb-6 pt-2">
          <DialogTitle className="title-display">Un compagnon, pas un raccourci</DialogTitle>
          <DialogDescription className="text-meta leading-relaxed text-muted-foreground">
            Sextant vous aide à découvrir plus d'articles évalués par les pairs, de thèses et d'ouvrages, et à passer
            de l'un à l'autre. Il ne remplace pas vos propres recherches sur Google Scholar, les bases spécialisées
            de votre discipline ou le catalogue de votre bibliothèque : il s'y ajoute.
          </DialogDescription>
          <ul className="grid gap-1.5 text-meta">
            <li className="flex gap-2"><span className="text-accent-brand" aria-hidden>●</span> Croisez toujours plusieurs sources.</li>
            <li className="flex gap-2"><span className="text-accent-brand" aria-hidden>●</span> Lisez l'article, pas seulement sa synthèse.</li>
            <li className="flex gap-2"><span className="text-accent-brand" aria-hidden>●</span> Les métadonnées viennent d'OpenAlex et peuvent comporter des erreurs.</li>
          </ul>
          <DialogClose render={<Button size="lg" className="mt-2 w-full" />}>Compris, je me lance</DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Illustration : le sextant vise une constellation d'articles. */
function WelcomeIllustration() {
  return (
    <Scene
      viewBox="0 0 400 176"
      className="h-44 items-end"
      art={
        <>
          {/* étoiles / articles */}
          <Constellation
            stars={[[70, 40, 3], [130, 24, 2], [330, 30, 3], [290, 60, 2], [360, 80, 2.5], [40, 90, 2]]}
            links="M70 40 130 24M290 60 330 30M330 30 360 80"
          />
          {/* fiches d'articles flottantes */}
          <g>
            <rect x="228" y="34" width="52" height="34" rx="6" className="fill-card stroke-brand" strokeWidth={1.5} />
            <rect x="236" y="43" width="30" height="3" rx="1.5" className="fill-brand" />
            <rect x="236" y="51" width="36" height="3" rx="1.5" className="fill-brand" fillOpacity={0.35} />
            <rect x="236" y="58" width="22" height="3" rx="1.5" className="fill-brand" fillOpacity={0.35} />
          </g>
          <g transform="rotate(-8 114 79)">
            <rect x="88" y="62" width="52" height="34" rx="6" className="fill-card stroke-brand" strokeWidth={1.5} />
            <rect x="96" y="71" width="30" height="3" rx="1.5" className="fill-brand" />
            <rect x="96" y="79" width="36" height="3" rx="1.5" className="fill-brand" fillOpacity={0.35} />
          </g>
        </>
      }
    >
      <LogoMark className="relative mb-6 size-24 text-foreground" />
    </Scene>
  );
}
