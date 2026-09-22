import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = { title: "À propos" };

export default function AboutPage() {
  return (
    <ProsePage
      title="À propos"
      intro="Sextant est une porte d'entrée vers la littérature scientifique : chercher, filtrer, et passer d'un article aux suivants."
    >
      <h2>Ce que Sextant fait</h2>
      <p>
        Vous tapez des mots-clés, Sextant remonte des articles évalués par les pairs, des revues de littérature, des thèses et
        des ouvrages universitaires, avec leurs métadonnées : auteurs, revue, année, citations, accès ouvert. Chaque fiche mène
        au PDF quand il est librement accessible, sinon vers l'éditeur, et propose des articles proches pour continuer.
      </p>

      <h2>Ce que Sextant ne fait pas</h2>
      <p>
        Il ne remplace pas vos propres recherches sur Google Scholar, les bases spécialisées de votre discipline ou le catalogue
        de votre bibliothèque. Il n'héberge aucun PDF et ne contourne aucun accès payant. Croisez toujours plusieurs sources.
      </p>

      <h2>D'où viennent les données</h2>
      <p>
        Les métadonnées bibliographiques proviennent d'<a href="https://openalex.org" target="_blank" rel="noreferrer">OpenAlex</a>,
        une base ouverte (licence CC0) maintenue par l'organisation à but non lucratif OurResearch. Elles peuvent comporter des
        erreurs ou des lacunes : un résumé manquant, une affiliation approximative, un décompte de citations en retard.
      </p>
      <p>Pour garder un contenu fiable, Sextant applique des filtres stricts :</p>
      <ul>
        <li>seuls les articles, revues de littérature, thèses, livres et chapitres sont servis ; préprints, éditoriaux, lettres, errata, rapports et jeux de données sont écartés ;</li>
        <li>par défaut, les résultats se limitent aux revues indexées (liste « core » d'OpenAlex, proche de Scopus et Web of Science) ; le filtre « Sources » permet d'élargir ;</li>
        <li>les documents rétractés sont exclus, et signalés si vous y accédez directement.</li>
      </ul>

      <h2>Le condensé par IA</h2>
      <p>
        Sur une fiche, vous pouvez demander un condensé en quatre points du résumé original, traduit en français si besoin. Il est
        généré à la demande par un modèle ouvert de <a href="https://mistral.ai" target="_blank" rel="noreferrer">Mistral AI</a>,
        hébergé en Europe, à partir du seul résumé. Il est indicatif : lisez l'article, pas seulement sa synthèse.
      </p>

      <h2>Pourquoi « Sextant »</h2>
      <p>Un sextant sert à faire le point et à tenir son cap. C'est ce qu'on aimerait vous offrir dans la littérature scientifique.</p>

      <p>
        Voir aussi : <Link href="/conditions">conditions d'utilisation</Link> et <Link href="/confidentialite">confidentialité</Link>.
      </p>
    </ProsePage>
  );
}
