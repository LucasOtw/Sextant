# Lot 8 — Accessibilité, suite (branche `lot-8`)

Suite de l'audit du 24/09 (`2026-09-24-audit-complet.md`, section « Lot 8 »). Le détail de chaque correctif est dans les messages de commit de la branche ; cette note résume, consigne les écarts par rapport aux recommandations et liste ce qui reste à vérifier à la main.

## Constats traités

| Constat | Correctif | Fichiers principaux |
|---|---|---|
| A11Y-04 | `lang` (langue OpenAlex) sur les titres, résumés et passages étrangers : fiche, cartes, lecteur, « Mes surlignages » (passages du résumé et du PDF, pas les saisies à la main), phrases proposées au choix | `lib/format.ts` (`contentLang`, `titleLang`), `highlight-item.tsx`, `sentence-picker-dialog.tsx`, `article/[id]/lire/page.tsx` |
| A11Y-06 | Note d'un passage lue comme texte ; « Modifier la note » à part, qui reprend le focus après Échap ou Cmd+Entrée ; un clic sur la note ouvre toujours l'édition (souris) | `highlight-item.tsx` |
| A11Y-07 | Fenêtre d'accueil fermée par Échap et clic extérieur ; absente du lecteur, des listes partagées et des pages légales | `welcome-dialog*.tsx`, `lib/quiet-routes.ts` |
| A11Y-11, A11Y-14 | Liens d'évitement (« Aller au contenu », « Aller aux résultats ») ; hiérarchie h1 → h2 → h3 sur /search | `skip-link.tsx`, `results.tsx` |
| A11Y-12, A11Y-13 | Région d'annonce commune ; résultats, copie, condensé IA annoncés ; compteur focalisable | `lib/announce.ts`, `results-status.tsx`, `hooks/use-copy.ts` |
| A11Y-15, A11Y-16, A11Y-17, A11Y-25 | Contrastes : rouge assombri, jeton `--input-border` pour les contours de champs, vote actif lisible en sombre, pagination inactive sans opacité | `globals.css`, `ui/input.tsx`, `ui/textarea.tsx`, `ui/select.tsx` |
| A11Y-18 | « Surligner des phrases » (résumé et page du PDF) : phrases en cases à cocher, au clavier ; seules les phrases pas encore retenues partent au second essai après un échec partiel | `sentence-picker-dialog.tsx`, `lib/sentences.ts` |
| A11Y-19 | Focus repris quand l'élément actif disparaît (favori, citation, clé, « Pas intéressé », historique) ; boutons d'ajout de « Mes surlignages » au même endroit de l'arbre avec ou sans passage, pour que la fenêtre leur rende le focus au premier surlignage | `lib/focus.ts`, `hooks/use-focus-recovery.ts`, `article-highlights.tsx` |
| A11Y-20 | Toasts « Annuler » de 10 s, fermables, Alt+T annoncé | `lib/undo-toast.ts`, `ui/sonner.tsx` |
| A11Y-21, A11Y-24 | Composant `Field` (libellé visible, facultatif, aide reliée) ; révocation de clé confirmée | `ui/field.tsx`, `account/mcp-keys.tsx` |
| A11Y-22 | Couche texte des pages PDF gardée ; passages en rôle `mark` ; pages en groupes « Page N » | `pdf-reader.tsx`, `lib/pdf-marks.ts` |
| A11Y-23, A11Y-26 | Noms des boutons de carte et de copie avec l'article ou le passage | `lib/labels.ts` |
| A11Y-27, A11Y-28 | Plus d'autofocus sur la recherche ; annonce MCP qui n'interrompt pas une saisie | `search-box.tsx`, `mcp-announcement.tsx` |
| A11Y-29 | Plein écran du lecteur confiné (reste de la page inerte) ; les fenêtres « Surligner des phrases » et « Ajouter une citation » sont montées dans l'élément en plein écran (sinon invisibles mais focalisées) ; la connexion demandée depuis le lecteur quitte d'abord le plein écran natif | `pdf-reader.tsx`, `dialog-container.tsx`, `ui/dialog.tsx` (prop `container`) |
| A11Y-30, A11Y-34 | États annoncés une fois (vote, plein écran), radios natifs, `aria-controls` des textes repliés | `feedback/feedback-board.tsx`, `highlight-item.tsx` |
| A11Y-31, A11Y-32 | Surlignage repérable sans la couleur (trait 2 px) ; mouvement réduit respecté | `globals.css`, composants `ui/*` |
| A11Y-35 | « (nouvel onglet) » sur les liens externes | `external-link.tsx` |
| A11Y-36 | Rien à changer dans ce lot : la 404 a déjà son propre titre (« Page introuvable ») | `app/not-found.tsx` |
| A11Y-37 | Fil d'Ariane et sujet actif sur /theme ; lien de la thématique souligné sur la fiche | `app/theme/[slug]/page.tsx` |
| A11Y-38 | Tailles de texte en rem | 55 occurrences `text-[…px]` |
| A11Y-39, A11Y-40 | Thème Clair / Sombre / Système, icône juste dès le rendu serveur | `theme-toggle.tsx`, `theme-menu.tsx`, `lib/theme.ts` |

## Choix faits par rapport aux recommandations

- **`WelcomeDialogContent` reste importé en direct**, sans `dynamic()` (A11Y-07 point 3, PERF-21) : le chargement différé dégradait le Speed Index mobile (commit 0a474b8). Le commentaire du fichier le dit.
- **Pas de `focusableWhenDisabled`** sur « Monter » / « Descendre » de /favoris (A11Y-19) : les boutons gardent `disabled`, et un `useLayoutEffect` remet le focus sur la flèche de la carte déplacée, ou sur l'autre flèche quand la carte atteint un bout de la liste. Même résultat au clavier, sans bouton inactif focalisable.
- **Nom fixe « Thème d'affichage »** pour le déclencheur du thème (A11Y-39), sans l'état dans le nom : le serveur ne connaît pas le thème choisi, et un nom qui change à l'hydratation est ce que le constat reprochait. L'état se lit dans le menu (radios Clair / Sombre / Système).
- **`lang` sur les passages du PDF aussi**, pas seulement ceux du résumé (A11Y-04) : le PDF est l'article, sa langue est celle d'OpenAlex. Les citations saisies à la main n'en reçoivent pas (langue inconnue). Sur /citations, qui mélange les articles, aucun `lang` n'est posé.
- **Fenêtres du lecteur en plein écran** : montées dans le conteneur plein écran par un contexte (`DialogContainerContext`), plutôt que de quitter le plein écran à l'ouverture. Limite connue : si l'on quitte le plein écran natif (Échap du navigateur) pendant que la fenêtre de choix est ouverte, elle est remontée dans `<body>` et les cases cochées sont perdues (la page choisie est gardée).

## Vérifié dans un navigateur (Chrome, serveur de dev sur les émulateurs)

- Fiche `/article/W2741809807`, sans surlignage : « Surligner des phrases du résumé » au clavier, une phrase cochée, « Surligner (1) » → fenêtre fermée, focus rendu au bouton (plus sur `<body>`), passage affiché avec `lang="en"`.
- Lecteur `/article/W2626778328/lire` : en plein écran natif, la fenêtre « Surligner des phrases » est dans `document.fullscreenElement`, focus à l'intérieur, phrases en `lang="en"`. Non connecté, le même bouton ouvre la connexion et non la fenêtre de choix.

## À faire par le propriétaire

1. **Écoute avec un lecteur d'écran** (A11Y-04, A11Y-22), VoiceOver (Safari, macOS ou iOS) et NVDA (Firefox ou Chrome, Windows) :
   - `/article/W4406431707` : le titre et le résumé anglais sont lus avec la voix anglaise ; les repères « passage surligné » et « Votre note : » restent en français ; dans « Mes surlignages », un passage du résumé est lu en anglais.
   - `/article/W4406431707/lire` (repli sur le PDF original : vérifier le message) puis `/article/W2626778328/lire` (lecteur Sextant) : les passages surlignés sont annoncés comme marqués (`role=mark`) ; « Page N » est annoncé en arrivant sur une page par « aller à la page » ; les phrases de « Surligner des phrases » sont lues en anglais.
2. **Double passe Lighthouse** (A11Y-07, point 4) sur l'accueil, /search, /theme/informatique et une fiche article, en mobile : une passe dans un profil neuf (fenêtre d'accueil ouverte), une avec `localStorage["sextant:welcomed"] = "1"` posé avant le chargement. Publier seulement le score a11y de la seconde ; noter l'écart de LCP entre les deux.
3. **Contrôle visuel des contrastes** (A11Y-15, A11Y-17), en clair et en sombre : contours des champs (recherche, note, citation à la main, nom de clé MCP, sélecteurs de /search) sur le fond et sur une carte ; rouge du badge « Rétracté », de « Supprimer mon compte » et des boutons « Supprimer » au survol.
4. **Police du navigateur sur « Très grande »** (A11Y-38) : Chrome, Réglages > Apparence > Taille de la police. Parcourir l'accueil, /search, une fiche, le lecteur, /favoris, /citations et /compte : texte qui grandit partout, sans chevauchement ni débordement horizontal (pastille du compteur de favoris comprise).
5. **Plein écran sur Safari (macOS, iPad)** : dans `/article/W2626778328/lire`, passer en plein écran puis ouvrir « Surligner des phrases » : la fenêtre doit être visible au-dessus du PDF et garder le focus. (« Mes surlignages », et donc « Ajouter une citation à la main », est masqué en plein écran ; la fenêtre suit néanmoins le même conteneur.)
