import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/prose-page";
import { SITE } from "@/lib/site";
import { ExternalLink } from "@/components/external-link";

export const metadata: Metadata = {
  title: "Mentions légales",
  description: "Éditeur et hébergeur de Sextant, contact, signalement d'un contenu et propriété intellectuelle.",
  alternates: { canonical: "/mentions-legales" },
};

export default function LegalNoticePage() {
  const publisher = SITE.publisherName;
  const email = SITE.contactEmail;
  const mail = email ? <a href={`mailto:${email}`}>{email}</a> : <strong>[adresse de contact à compléter]</strong>;

  return (
    <ProsePage title="Mentions légales" intro="Qui édite Sextant, qui l'héberge, et comment nous joindre." updated="26 septembre 2026">
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
        Pour toute question, signalement d'erreur ou demande relative à vos données : {mail}.
      </p>

      {/* Ancre visée par les liens « Signaler » des sujets et des listes partagées (lib/report.ts, SEC-13). */}
      <h2 id="signaler" className="scroll-mt-24">Signaler un contenu</h2>
      <p>
        Sextant héberge des contenus publiés par ses utilisateurs : les sujets de la page <Link href="/retours">Bugs et idées</Link> et
        les listes partagées par lien. Pour signaler un contenu que vous estimez illicite (règlement européen sur les services
        numériques, art. 16), utilisez le lien « Signaler » placé à côté de ce contenu, ou écrivez à {mail} en indiquant :
      </p>
      <ul>
        <li>l'adresse exacte (URL) du contenu ;</li>
        <li>les raisons pour lesquelles vous le jugez illicite ;</li>
        <li>vos nom et adresse e-mail ;</li>
        <li>une déclaration attestant que votre signalement est exact, complet et fait de bonne foi.</li>
      </ul>
      <p>
        Chaque signalement est examiné, et vous êtes informé de la suite qui lui est donnée. Un contenu illicite ou contraire aux{" "}
        <Link href="/conditions">conditions d'utilisation</Link> est retiré, et un lien de partage peut être désactivé.
      </p>

      <h2>Hébergeur</h2>
      <p>
        Le site est hébergé par <strong>{SITE.host.name}</strong>, {SITE.host.address}.<br />
        Site : <ExternalLink href={SITE.host.url}>{SITE.host.url}</ExternalLink> · Contact : {SITE.host.contact}
      </p>

      <h2>Stockage des données des comptes</h2>
      <p>
        Les données des comptes (profil, favoris, listes, citations, notes) sont stockées par <strong>Google Cloud Firebase</strong> (Google
        Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irlande), dans la région Europe-Paris. La connexion passe par Firebase
        Authentication.
      </p>

      <h2>Données bibliographiques</h2>
      <p>
        Les métadonnées d'articles proviennent d'<ExternalLink href="https://openalex.org">OpenAlex</ExternalLink>,
        publiées sous licence CC0 par OurResearch. Les titres, résumés et textes des publications restent la propriété de leurs
        auteurs et éditeurs ; Sextant n'en héberge aucun et renvoie vers les sites d'origine.
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        Le nom « Sextant », son logo, l'interface et les textes du site sont la propriété de l'éditeur. Le code source est consultable
        sur <ExternalLink href="https://github.com/LucasOtw/Sextant">GitHub</ExternalLink>
        {SITE.codeLicense ? (
          <>
            {" "}sous licence <strong>{SITE.codeLicense}</strong> (fichier LICENSE du dépôt). Cette licence ne couvre ni le nom ni le logo
            Sextant.
          </>
        ) : (
          <>
            {" "}; aucune licence de réutilisation n'y est attachée pour l'instant : sauf accord de l'éditeur, les droits sur le code
            restent réservés.
          </>
        )}
      </p>

      <h2>Données personnelles</h2>
      <p>
        Sans compte, Sextant ne conserve aucune donnée personnelle ; avec un compte, il ne conserve que votre profil Google, les dates de création du compte
        et de dernière connexion, et ce que vous y enregistrez, que vous pouvez télécharger ou effacer à tout moment. Ni cookie de suivi ni mesure d'audience. Le détail se trouve dans la{" "}
        <Link href="/confidentialite">politique de confidentialité</Link>. Les règles d'usage du service sont décrites dans les{" "}
        <Link href="/conditions">conditions d'utilisation</Link>.
      </p>
    </ProsePage>
  );
}
