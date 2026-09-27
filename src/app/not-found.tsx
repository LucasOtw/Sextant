import type { Metadata } from "next";
import Link from "next/link";
import { CompassIcon, HomeIcon } from "lucide-react";
import { ErrorScene } from "@/components/error-scene";
import { SearchBox } from "@/components/search-box";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page introuvable", robots: { index: false } };

/** 404 : lien cassé, article inexistant, lien de partage désactivé. */
export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-12 sm:px-6 sm:py-16">
      <ErrorScene variant="lost" code="404" />
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-sm font-semibold text-accent-brand">Erreur 404</p>
        <h1 className="title-display type-h1">Cette page a pris le large</h1>
        <p className="lead">
          L'adresse ne mène nulle part : la page a été déplacée, l'identifiant est incorrect ou le lien de partage a été désactivé.
          Faites le point et repartez d'ici.
        </p>
      </div>
      <SearchBox className="mx-auto w-full max-w-lg" />
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/" className={buttonVariants({ size: "lg" })}><HomeIcon /> Retour à l'accueil</Link>
        <Link href="/#themes" className={buttonVariants({ variant: "outline", size: "lg" })}><CompassIcon /> Explorer les thématiques</Link>
      </div>
      <p className="text-center text-sm text-muted-foreground">
        Un lien cassé sur Sextant&#8239;? <Link href="/retours" className="link">Signalez-le dans Bugs et idées</Link>.
      </p>
    </div>
  );
}
