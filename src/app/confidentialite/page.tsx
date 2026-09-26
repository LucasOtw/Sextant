import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/prose-page";
import { SITE } from "@/lib/site";
import { ExternalLink } from "@/components/external-link";
import { RETENTION, retentionLabel, validMonths } from "@/lib/retention";

export const metadata: Metadata = {
  title: "Confidentialité",
  description: "Ce que Sextant garde, sans compte et avec un compte, les services tiers qu'il utilise, et vos droits sur vos données : export, effacement.",
  alternates: { canonical: "/confidentialite" },
};

const UPDATED = "26 septembre 2026";

export default function PrivacyPage() {
  const contact = SITE.contactEmail ? <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> : <strong>[adresse de contact à compléter]</strong>;
  // Durées décidées par l'éditeur (lib/retention.ts, NEW-14) : la même constante règle la purge automatique. Tant
  // qu'une durée vaut null, le texte s'en tient à « tant que le compte existe » (aucun emplacement à compléter en ligne).
  const accountMonths = validMonths(RETENTION.inactiveAccountMonths);
  const keyMonths = validMonths(RETENTION.unusedKeyMonths);
  const messageMonths = validMonths(RETENTION.messageMonths);

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
        <li>votre préférence d'affichage clair ou sombre, et le fait d'avoir lu le message d'accueil et l'annonce des assistants IA ;</li>
        <li>la liste des derniers articles consultés (« Consultés récemment ») ;</li>
        <li>les suggestions que vous avez écartées dans « Pour vous » (leurs identifiants servent aussi au calcul, voir ci-dessous) ;</li>
        <li>brièvement, l'article que vous vouliez enregistrer au moment de vous connecter, pour l'ajouter une fois connecté (10 minutes au plus) ;</li>
        <li>le temps de l'onglet seulement, les condensés IA que vous avez déjà demandés, pour ne pas les redemander (ils disparaissent à la fermeture de l'onglet).</li>
      </ul>
      <p>
        Pour calculer « Pour vous », votre navigateur envoie au serveur de Sextant, dans l'adresse de la requête, les identifiants
        publics des articles consultés, des suggestions écartées et de vos favoris si vous êtes connecté. Ils servent à la réponse et
        ne sont pas enregistrés par Sextant ; comme toute adresse demandée, ils peuvent figurer dans les journaux techniques de
        l'hébergeur (voir Vercel ci-dessous). La réponse n'est gardée en cache que dans votre navigateur, cinq minutes. Vous pouvez tout
        effacer en vidant les données du site dans votre navigateur ; l'historique s'efface aussi depuis l'accueil.
      </p>

      <h2>Avec un compte</h2>
      <p>
        La connexion se fait avec Google, via Firebase Authentication (Google). Nous recevons votre nom, votre adresse e-mail, votre photo
        de profil Google et un identifiant technique. Aucun mot de passe n'est stocké chez nous. Nous enregistrons aussi la date de
        création du compte et celle de votre dernière connexion. Nous conservons ensuite ce que vous enregistrez :
      </p>
      <ul>
        <li><strong>favoris</strong> : les articles et leurs références (titre, auteurs, revue, année) ;</li>
        <li><strong>listes</strong> : leur nom, leur description, leur ordre et les articles qu'elles contiennent ;</li>
        <li><strong>citations</strong> : les passages surlignés, leur page, leur date et vos notes éventuelles ;</li>
        <li><strong>notes</strong> : ce que vous écrivez sur un article ;</li>
        <li>
          le <strong>dernier favori retiré</strong>, pour que « Annuler » puisse le rétablir ; il est remplacé au retrait suivant. Pour chaque
          favori retiré, nous gardons aussi son identifiant, sa date d'ajout et celle du retrait, pour que « Annuler » lui rende sa date
          d'ajout : ces informations sont effacées dès que « Annuler » le rétablit dans les 10 minutes, sinon au premier retrait de favori
          qui suit ces 10 minutes.
        </li>
      </ul>
      <p>
        Ces données sont privées : personne d'autre que vous n'y a accès depuis Sextant, sauf une liste que vous choisissez de partager
        par lien. Toute personne qui a ce lien voit alors le nom de la liste, sa description et ses articles, jamais vos notes, vos
        citations ni votre profil ; vous pouvez désactiver le lien à tout moment, il cesse aussitôt de fonctionner. Ces données sont
        conservées dans une base Firestore (Google Cloud) située en Europe, région Paris.
      </p>
      <ul>
        <li><strong>Finalité et base légale</strong> : fournir le service que vous demandez en créant un compte (exécution du contrat, RGPD art. 6.1.b).</li>
        <li>
          <strong>Durée</strong> : tant que le compte existe
          {accountMonths && (
            <>
              , et au plus {retentionLabel(accountMonths)} après votre dernière connexion ou le dernier usage d'une de vos clés d'assistant IA :
              passé ce délai, le compte est supprimé automatiquement avec toutes ses données
            </>
          )}
          . Sa suppression, depuis « Mon compte », efface immédiatement le profil et toutes les données rattachées.
        </li>
        <li>
          <strong>Session</strong> : un cookie technique <code>sextant_session</code>, strictement nécessaire pour rester connecté, valable 14 jours,
          accompagné d'un cookie <code>sextant_signed_in</code> sans donnée personnelle, qui indique seulement aux pages si une session est ouverte
          (pour afficher votre compte sans attendre) ; il suit la durée de la session (une heure au plus quand une session expirée ou révoquée
          est refusée) et disparaît à la déconnexion. Le module de connexion de Google n'est chargé qu'au moment de la connexion, et l'état qu'il laisse dans le stockage du navigateur est
          effacé dès la session ouverte.
        </li>
      </ul>

      <h2>Assistants IA branchés à votre compte (MCP)</h2>
      <p>
        Depuis « Mon compte », vous pouvez créer des clés personnelles pour donner à un assistant IA de votre choix (Claude, ChatGPT…)
        un accès en lecture seule à votre bibliothèque : favoris, listes, citations et notes. Sextant ne conserve que l'empreinte de chaque
        clé (jamais la clé entière), ses dix premiers caractères pour que vous la reconnaissiez, son nom, ses dates de création et de
        dernière utilisation, et la date de la connexion Google depuis laquelle elle a été créée (la clé est révoquée avec cette session),
        ainsi que, dans votre profil, la date du dernier usage d'une de vos clés, qui reste connue après la révocation de la clé. Ce que vous consultez ainsi est
        transmis à l'assistant que vous avez branché et relève alors de sa propre politique de confidentialité. Une clé se révoque à tout
        moment ; toutes sont supprimées avec le compte.
        {keyMonths && (
          <> Une clé inutilisée pendant {retentionLabel(keyMonths)} (depuis sa création si elle n'a jamais servi) est supprimée automatiquement.</>
        )}
      </p>

      <h2>Bugs et idées</h2>
      <p>
        Les sujets publiés sur la page « Bugs et idées » sont publics et n'affichent pas leur auteur ; Sextant garde l'identifiant technique
        du compte qui les a publiés, pour limiter les abus, ainsi que vos votes et leur date. Les votes sont anonymes pour les autres
        visiteurs. À la suppression du compte, ses votes sont effacés et ses sujets restent en ligne, détachés de lui. Un sujet ou une
        liste partagée qui enfreint la loi peut nous être signalé : voir <Link href="/mentions-legales#signaler">Signaler un contenu</Link>.
      </p>

      <h2>Signalements et messages</h2>
      <p>
        Quand vous nous écrivez, pour signaler un contenu (lien « Signaler ») ou pour toute autre demande, nous recevons ce que contient
        votre courriel : votre adresse e-mail, le nom que vous indiquez, votre message et, pour un signalement, l'adresse du contenu
        signalé. Ces données servent uniquement à traiter votre signalement ou votre demande et à vous répondre.
      </p>
      <ul>
        <li>
          <strong>Base légale</strong> : pour un signalement, l'obligation légale de traiter les signalements de contenus illicites et
          d'informer leur auteur de la suite donnée (règlement sur les services numériques, art. 16 ; RGPD art. 6.1.c) ; pour les autres
          messages, notre intérêt légitime à répondre aux personnes qui nous écrivent (RGPD art. 6.1.f).
        </li>
        <li>
          <strong>Durée</strong> : ces messages restent dans la messagerie de l'éditeur
          {messageMonths ? <>, au plus {retentionLabel(messageMonths)} après la fin de l'échange</> : <> jusqu'à ce qu'il les supprime ; aucune suppression automatique n'est prévue</>}.
        </li>
        <li>
          <strong>Destinataires</strong> : l'éditeur seul, et le fournisseur de sa messagerie, qui héberge la boîte de réception. Ils ne
          sont pas enregistrés dans Sextant ni rattachés à un compte.
        </li>
      </ul>

      <h2>Services tiers et sous-traitants</h2>
      <ul>
        <li>
          <strong>Vercel</strong> (États-Unis) héberge le site et exécute son serveur à Paris. Comme tout hébergeur, il conserve pour une durée limitée des
          journaux techniques (adresse IP, pages demandées, navigateur) à des fins de sécurité ; Sextant ne les exploite pas. Le serveur garde aussi,
          en mémoire seulement, jamais sur disque, un compteur par adresse IP ou par compte pour limiter les abus : tant que le serveur reçoit
          des requêtes, il est effacé au plus tard une minute après la fin de sa période de comptage (une heure au plus) ; sinon, il
          disparaît à l'arrêt de l'instance serveur.
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
        Sextant n'utilise ni cookie de suivi, ni outil de mesure d'audience, ni publicité. Les seuls cookies posés sont les deux cookies de
        session des comptes, décrits ci-dessus ; étant strictement nécessaires, ils ne demandent pas de consentement.
      </p>

      <h2>Vos droits</h2>
      <p>Vous disposez des droits d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité (RGPD, art. 15 à 21).</p>
      <ul>
        <li>
          <strong>Accès et portabilité</strong> : « Télécharger mes données », sur la page « Mon compte », fournit un fichier JSON avec tout ce que
          Sextant conserve pour vous : profil et dates de création, de dernière connexion et de dernier usage d'une clé d'assistant IA,
          favoris, dernier favori retiré et dates des favoris retirés récemment, listes et liens de partage, citations, notes, clés
          d'assistant IA (sans leur empreinte, avec leurs premiers caractères et la date de la connexion depuis laquelle elles ont été créées), sujets publiés et votes sur « Bugs et idées ». Les
          messages que vous nous avez envoyés n'y figurent pas : ils sont dans notre messagerie, pas dans Sextant.
        </li>
        <li><strong>Rectification</strong> : vos favoris, listes, citations et notes se modifient directement dans Sextant ; votre nom et votre photo viennent de votre compte Google.</li>
        <li><strong>Effacement</strong> : « Supprimer mon compte » efface tout, immédiatement et sans nous solliciter.</li>
        <li>Pour toute autre demande : {contact}. Nous répondons dans un délai d'un mois.</li>
      </ul>
      <p>
        Si vous estimez que vos droits ne sont pas respectés, vous pouvez adresser une réclamation à la CNIL
        (<ExternalLink href="https://www.cnil.fr/fr/plaintes">cnil.fr/fr/plaintes</ExternalLink>).
      </p>

      <h2>Évolution</h2>
      <p>Cette page suit les fonctionnalités du site ; la date en tête indique la dernière version.</p>
    </ProsePage>
  );
}
