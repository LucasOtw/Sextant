import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = { title: "Conditions d'utilisation" };

export default function TermsPage() {
  return (
    <ProsePage title="Conditions d'utilisation" intro="En clair, et en quelques points." updated="24 septembre 2026">
      <h2>Le service</h2>
      <p>
        Sextant est un moteur de recherche et de découverte d'articles scientifiques, gratuit et sans publicité. La recherche ne demande
        aucun compte ; un compte, facultatif, permet de garder ses favoris, ses listes, ses citations et ses notes. Sextant agrège des
        métadonnées publiques et renvoie vers les sites des éditeurs ou des archives ouvertes.
      </p>

      <h2>Lecture des PDF</h2>
      <p>
        Le lecteur intégré n'affiche que des versions déclarées en accès ouvert. Il les relaie depuis leur hébergeur, sans les stocker ni les
        redistribuer, et ne contourne aucun accès payant : sans version libre connue, Sextant renvoie vers l'éditeur. Les PDF restent soumis
        à la licence choisie par leurs auteurs et éditeurs, que vous vous engagez à respecter.
      </p>

      <h2>Usage</h2>
      <p>Vous pouvez utiliser Sextant pour vos études, votre recherche ou votre curiosité. Vous vous engagez à ne pas :</p>
      <ul>
        <li>contourner les droits d'accès des éditeurs ou les conditions des sites vers lesquels Sextant renvoie ;</li>
        <li>aspirer massivement le service ou ses interfaces techniques, ni vous servir du lecteur pour télécharger des PDF en masse ;</li>
        <li>présenter les condensés générés par IA comme des citations de l'article ou de ses auteurs.</li>
      </ul>

      <h2>Compte et contenus que vous créez</h2>
      <p>
        Le compte est personnel et se crée par connexion Google. Vos favoris, listes, citations et notes vous appartiennent et restent privés.
        Vous pouvez les télécharger ou supprimer votre compte à tout moment depuis « Mon compte », ce qui efface l'ensemble de vos données.
        Nous pouvons fermer un compte utilisé pour contourner les règles d'usage ci-dessus.
      </p>

      <h2>Contenus et exactitude</h2>
      <p>
        Les métadonnées proviennent d'<a href="https://openalex.org" target="_blank" rel="noreferrer">OpenAlex</a> et sont fournies « en
        l'état ». Les condensés par IA et les suggestions « Pour vous » sont indicatifs et peuvent contenir des erreurs. Sextant ne garantit
        ni l'exhaustivité, ni l'exactitude, ni la disponibilité continue du service, et ne saurait être tenu responsable de l'usage que vous
        faites des informations consultées. Référez-vous toujours à la publication originale.
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        Les articles, résumés et métadonnées appartiennent à leurs auteurs et éditeurs respectifs. Les données OpenAlex sont publiées sous
        licence CC0. Le nom, le logo et l'interface de Sextant restent la propriété de leur auteur.
      </p>

      <h2>Droit applicable</h2>
      <p>
        Le site est édité en France et soumis au droit français. L'identité de l'éditeur et de l'hébergeur figure dans les{" "}
        <Link href="/mentions-legales">mentions légales</Link> ; le traitement de vos données, dans la{" "}
        <Link href="/confidentialite">politique de confidentialité</Link>.
      </p>

      <h2>Évolution</h2>
      <p>Ces conditions peuvent évoluer avec les fonctionnalités du site. La date en tête de page indique la dernière version.</p>
    </ProsePage>
  );
}
