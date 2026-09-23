import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/prose-page";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Mentions légales" };

export default function LegalNoticePage() {
  const publisher = SITE.publisherName;
  const email = SITE.contactEmail;

  return (
    <ProsePage title="Mentions légales" intro="Qui édite Sextant, qui l'héberge, et comment nous joindre." updated="23 septembre 2026">
      <h2>Éditeur du site</h2>
      <p>
        {SITE.name} est un site personnel, sans but lucratif, édité par{" "}
        {publisher ? <strong>{publisher}</strong> : <strong>[nom de l'éditeur à compléter]</strong>}, qui en est également
        le directeur de la publication.
      </p>
      <p>
        Conformément à l'article 6-III-2 de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique,
        l'éditeur, personne physique agissant à titre non professionnel, a choisi de ne pas publier son adresse. Son identité
        et ses coordonnées sont tenues à disposition de l'hébergeur, qui peut les communiquer aux autorités judiciaires sur
        demande.
      </p>

      <h2>Contact</h2>
      <p>
        Pour toute question, signalement d'erreur ou demande relative à vos données :{" "}
        {email ? <a href={`mailto:${email}`}>{email}</a> : <strong>[adresse de contact à compléter]</strong>}.
      </p>

      <h2>Hébergeur</h2>
      <p>
        Le site est hébergé par <strong>{SITE.host.name}</strong>, {SITE.host.address}.<br />
        Site : <a href={SITE.host.url} target="_blank" rel="noreferrer">{SITE.host.url}</a> · Contact : {SITE.host.contact}
      </p>

      <h2>Données bibliographiques</h2>
      <p>
        Les métadonnées d'articles proviennent d'<a href="https://openalex.org" target="_blank" rel="noreferrer">OpenAlex</a>,
        publiées sous licence CC0 par OurResearch. Les titres, résumés et textes des publications restent la propriété de leurs
        auteurs et éditeurs ; Sextant n'en héberge aucun et renvoie vers les sites d'origine.
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        Le nom « Sextant », son logo, l'interface et les textes du site sont la propriété de l'éditeur. Le code source est publié sur{" "}
        <a href="https://github.com/lucas-tomexplore/Sextant" target="_blank" rel="noreferrer">GitHub</a> ; les conditions de
        réutilisation du code sont celles indiquées dans le dépôt.
      </p>

      <h2>Données personnelles</h2>
      <p>
        Sextant ne collecte aucune donnée personnelle et n'utilise ni cookie de suivi ni mesure d'audience. Le détail se trouve dans la{" "}
        <Link href="/confidentialite">politique de confidentialité</Link>. Les règles d'usage du service sont décrites dans les{" "}
        <Link href="/conditions">conditions d'utilisation</Link>.
      </p>
    </ProsePage>
  );
}
