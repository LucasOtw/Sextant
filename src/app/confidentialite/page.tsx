import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/prose-page";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Confidentialité" };

export default function PrivacyPage() {
  return (
    <ProsePage title="Confidentialité" intro="Sextant fonctionne sans compte et collecte le strict minimum." updated="23 septembre 2026">
      <h2>Ce qui reste dans votre navigateur</h2>
      <p>Trois informations sont enregistrées localement, sur votre appareil uniquement, et ne sont jamais envoyées à Sextant :</p>
      <ul>
        <li>votre préférence d'affichage clair ou sombre ;</li>
        <li>le fait d'avoir lu le message d'accueil ;</li>
        <li>la liste des derniers articles consultés, pour la section « Consultés récemment ».</li>
      </ul>
      <p>Vous pouvez effacer cet historique depuis l'accueil, ou en vidant les données de site de votre navigateur.</p>

      <h2>Ce qui transite par des services tiers</h2>
      <ul>
        <li>
          <strong>OpenAlex</strong> reçoit vos requêtes de recherche (mots-clés, filtres) pour renvoyer les résultats. Elles
          sont relayées par le serveur de Sextant, sans identifiant vous concernant.
        </li>
        <li>
          <strong>Mistral AI</strong> (France) reçoit, uniquement lorsque vous cliquez sur le bouton de condensé, le titre et le
          résumé public de l'article concerné. Aucune donnée vous concernant ne lui est transmise.
        </li>
        <li>
          Les liens « Lire le PDF », « Voir chez l'éditeur », ORCID, Wikipédia et sites d'universités vous emmènent sur des sites
          tiers soumis à leurs propres politiques.
        </li>
      </ul>

      <h2>Cookies et mesure d'audience</h2>
      <p>Sextant n'utilise ni cookie de suivi, ni outil de mesure d'audience, ni publicité.</p>

      <h2>Hébergement et journaux techniques</h2>
      <p>
        Le site est hébergé par {SITE.host.name} (États-Unis). Comme tout hébergeur, Vercel conserve des journaux techniques (adresse IP, pages
        demandées, navigateur) pendant une durée limitée, à des fins de sécurité et de bon fonctionnement. Ces journaux ne
        sont pas exploités par Sextant.
      </p>

      <h2>Responsable et contact</h2>
      <p>
        Le responsable du site est l'éditeur indiqué dans les <Link href="/mentions-legales">mentions légales</Link>. Pour toute
        question sur cette page :{" "}
        {SITE.contactEmail ? <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> : <strong>[adresse de contact à compléter]</strong>}.
      </p>

      <h2>Vos droits</h2>
      <p>
        Sextant ne constitue aucun fichier de personnes : il n'y a donc, à ce jour, aucune donnée personnelle à consulter,
        corriger ou supprimer de notre côté. Si des comptes utilisateurs sont introduits, cette page sera mise à jour avant
        leur ouverture, avec la base légale, les durées de conservation et les moyens d'exercer vos droits.
      </p>
    </ProsePage>
  );
}
