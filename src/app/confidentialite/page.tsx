import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/prose-page";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Confidentialité" };

const UPDATED = "24 septembre 2026";

export default function PrivacyPage() {
  const contact = SITE.contactEmail ? <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> : <strong>[adresse de contact à compléter]</strong>;

  return (
    <ProsePage
      title="Confidentialité"
      intro="Sextant fonctionne sans compte. Si vous en créez un, il ne contient que votre profil Google et ce que vous y enregistrez. Ni publicité, ni mesure d'audience, ni revente de données."
      updated={UPDATED}
    >
      <h2>Responsable du traitement</h2>
      <p>
        Le responsable des traitements décrits ici est l'éditeur du site, indiqué dans les <Link href="/mentions-legales">mentions légales</Link>.
        Contact pour toute question ou demande relative à vos données : {contact}.
      </p>

      <h2>Sans compte : ce qui reste dans votre navigateur</h2>
      <p>Ces informations sont enregistrées localement, sur votre appareil, et ne sont pas conservées par Sextant :</p>
      <ul>
        <li>votre préférence d'affichage clair ou sombre, et le fait d'avoir lu le message d'accueil ;</li>
        <li>la liste des derniers articles consultés (« Consultés récemment ») ;</li>
        <li>les suggestions que vous avez écartées dans « Pour vous » ;</li>
        <li>brièvement, l'article que vous vouliez enregistrer au moment de vous connecter, pour l'ajouter une fois connecté (10 minutes au plus).</li>
      </ul>
      <p>
        Pour calculer « Pour vous », votre navigateur envoie au serveur de Sextant les identifiants publics des articles consultés
        (et de vos favoris si vous êtes connecté). Ils servent à la réponse puis ne sont pas conservés. Vous pouvez tout effacer en
        vidant les données du site dans votre navigateur ; l'historique s'efface aussi depuis l'accueil.
      </p>

      <h2>Avec un compte</h2>
      <p>
        La connexion se fait avec Google, via Firebase Authentication (Google). Nous recevons votre nom, votre adresse e-mail, votre photo
        de profil Google et un identifiant technique. Aucun mot de passe n'est stocké chez nous. Nous conservons ensuite ce que vous
        enregistrez :
      </p>
      <ul>
        <li><strong>favoris</strong> : les articles et leurs références (titre, auteurs, revue, année) ;</li>
        <li><strong>listes</strong> : leur nom, leur description, leur ordre et les articles qu'elles contiennent ;</li>
        <li><strong>citations</strong> : les passages surlignés, leur page, leur date et vos notes éventuelles ;</li>
        <li><strong>notes</strong> : ce que vous écrivez sur un article.</li>
      </ul>
      <p>
        Ces données sont privées : personne d'autre que vous n'y a accès depuis Sextant. Elles sont conservées dans une base Firestore
        (Google Cloud) située en Europe, région Paris.
      </p>
      <ul>
        <li><strong>Finalité et base légale</strong> : fournir le service que vous demandez en créant un compte (exécution du contrat, RGPD art. 6.1.b).</li>
        <li><strong>Durée</strong> : tant que le compte existe. Sa suppression, depuis « Mon compte », efface immédiatement le profil et toutes les données rattachées.</li>
        <li>
          <strong>Session</strong> : un cookie technique <code>sextant_session</code>, strictement nécessaire pour rester connecté, valable 14 jours ;
          le module de connexion de Google garde aussi l'état de connexion dans le stockage du navigateur jusqu'à la déconnexion.
        </li>
      </ul>

      <h2>Services tiers et sous-traitants</h2>
      <ul>
        <li>
          <strong>Vercel</strong> (États-Unis) héberge le site et exécute son serveur. Comme tout hébergeur, il conserve pour une durée limitée des
          journaux techniques (adresse IP, pages demandées, navigateur) à des fins de sécurité ; Sextant ne les exploite pas. Le serveur garde aussi,
          quelques minutes et en mémoire seulement, un compteur par adresse IP ou par compte pour limiter les abus.
        </li>
        <li>
          <strong>Google Firebase</strong> (connexion et base de données). Les données d'identification peuvent être traitées hors de l'Union
          européenne dans le cadre des garanties contractuelles de Google ; les données de votre bibliothèque restent stockées à Paris.
        </li>
        <li>
          <strong>OpenAlex</strong> (OurResearch, États-Unis) reçoit, via le serveur de Sextant, vos recherches et les identifiants d'articles
          nécessaires aux fiches et aux suggestions, sans aucune donnée vous concernant.
        </li>
        <li>
          <strong>Mistral AI</strong> (France) reçoit, uniquement quand vous demandez un condensé, le titre et le résumé public de l'article.
          Aucune donnée vous concernant ne lui est transmise.
        </li>
        <li>
          <strong>Lecteur PDF</strong> : pour les articles en accès ouvert, le serveur de Sextant récupère le PDF chez son hébergeur (éditeur,
          arXiv, HAL…) et vous le transmet sans le conserver ; l'hébergeur voit la requête du serveur, pas la vôtre. Quand un hébergeur refuse
          ce relais, le PDF s'affiche directement depuis son site, qui voit alors votre adresse IP comme pour tout lien.
        </li>
        <li>
          Les liens « Voir chez l'éditeur », « Chercher une version libre » (Google Scholar), ORCID, Wikipédia et sites d'universités vous
          emmènent sur des sites tiers soumis à leurs propres politiques.
        </li>
      </ul>
      <p>
        Les transferts vers les États-Unis (Vercel, Google, OpenAlex) s'appuient sur les clauses contractuelles types de la Commission
        européenne ou sur le cadre de protection des données UE–États-Unis, selon le prestataire.
      </p>

      <h2>Cookies et mesure d'audience</h2>
      <p>
        Sextant n'utilise ni cookie de suivi, ni outil de mesure d'audience, ni publicité. Le seul cookie posé est le cookie de session des
        comptes, décrit ci-dessus ; étant strictement nécessaire, il ne demande pas de consentement.
      </p>

      <h2>Vos droits</h2>
      <p>Vous disposez des droits d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité (RGPD, art. 15 à 21).</p>
      <ul>
        <li><strong>Accès et portabilité</strong> : « Télécharger mes données », sur la page « Mon compte », fournit un fichier JSON avec tout ce que Sextant conserve pour vous.</li>
        <li><strong>Rectification</strong> : vos favoris, listes, citations et notes se modifient directement dans Sextant ; votre nom et votre photo viennent de votre compte Google.</li>
        <li><strong>Effacement</strong> : « Supprimer mon compte » efface tout, immédiatement et sans nous solliciter.</li>
        <li>Pour toute autre demande : {contact}. Nous répondons dans un délai d'un mois.</li>
      </ul>
      <p>
        Si vous estimez que vos droits ne sont pas respectés, vous pouvez adresser une réclamation à la CNIL
        (<a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noreferrer">cnil.fr/fr/plaintes</a>).
      </p>

      <h2>Évolution</h2>
      <p>Cette page suit les fonctionnalités du site ; la date en tête indique la dernière version.</p>
    </ProsePage>
  );
}
