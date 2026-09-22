import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = { title: "Conditions d'utilisation" };

export default function TermsPage() {
  return (
    <ProsePage title="Conditions d'utilisation" intro="En clair, et en quelques points." updated="22 septembre 2026">
      <h2>Le service</h2>
      <p>
        Sextant est un moteur de recherche et de découverte d'articles scientifiques, fourni gratuitement et sans création de
        compte. Il agrège des métadonnées publiques et renvoie vers les sites des éditeurs ou des archives ouvertes. Il
        n'héberge, ne reproduit ni ne distribue le texte intégral des publications.
      </p>

      <h2>Usage</h2>
      <p>Vous pouvez utiliser Sextant pour vos études, votre recherche ou votre curiosité. Vous vous engagez à ne pas :</p>
      <ul>
        <li>contourner les droits d'accès des éditeurs ou les conditions des sites vers lesquels Sextant renvoie ;</li>
        <li>aspirer massivement le service ou ses interfaces techniques ;</li>
        <li>présenter les condensés générés par IA comme des citations de l'article ou de ses auteurs.</li>
      </ul>

      <h2>Contenus et exactitude</h2>
      <p>
        Les métadonnées proviennent d'<a href="https://openalex.org" target="_blank" rel="noreferrer">OpenAlex</a> et sont
        fournies « en l'état ». Les condensés par IA sont indicatifs et peuvent contenir des erreurs. Sextant ne garantit ni
        l'exhaustivité, ni l'exactitude, ni la disponibilité continue du service, et ne saurait être tenu responsable de
        l'usage que vous faites des informations consultées. Référez-vous toujours à la publication originale.
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        Les articles, résumés et métadonnées appartiennent à leurs auteurs et éditeurs respectifs. Les données OpenAlex sont
        publiées sous licence CC0. Le nom, le logo et l'interface de Sextant restent la propriété de leur auteur.
      </p>

      <h2>Évolution</h2>
      <p>
        Ces conditions peuvent évoluer, notamment lors de l'ajout de fonctionnalités comme les comptes utilisateurs. La date en
        tête de page indique la dernière version. Voir aussi la <Link href="/confidentialite">politique de confidentialité</Link>.
      </p>
    </ProsePage>
  );
}
