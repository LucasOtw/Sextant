import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = { title: "Confidentialité" };

export default function PrivacyPage() {
  return (
    <ProsePage title="Confidentialité" intro="Sextant fonctionne sans compte et collecte le strict minimum." updated="22 septembre 2026">
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
          <strong>Mistral AI</strong> reçoit, uniquement lorsque vous cliquez sur le bouton de condensé, le titre et le résumé
          public de l'article concerné. Aucune donnée vous concernant ne lui est transmise.
        </li>
        <li>
          Les liens « Lire le PDF », « Voir chez l'éditeur », ORCID, Wikipédia et sites d'universités vous emmènent sur des sites
          tiers soumis à leurs propres politiques.
        </li>
      </ul>

      <h2>Cookies et mesure d'audience</h2>
      <p>Sextant n'utilise ni cookie de suivi, ni outil de mesure d'audience, ni publicité.</p>

      <h2>Hébergement</h2>
      <p>
        Comme tout site, le serveur d'hébergement conserve des journaux techniques (adresse IP, pages demandées) pendant une
        durée limitée, à des fins de sécurité et de bon fonctionnement.
      </p>

      <h2>Vos droits</h2>
      <p>
        Sextant ne constituant aucun fichier de personnes, il n'y a pas de donnée personnelle à consulter, corriger ou
        supprimer de notre côté. Cette page sera mise à jour si des comptes utilisateurs sont introduits.
      </p>
    </ProsePage>
  );
}
