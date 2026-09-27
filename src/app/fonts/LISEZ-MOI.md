# Polices du site

Fichiers servis par le site lui-même (`next/font/local`, cf. `index.ts` et `faces.css`) : le build n'a pas besoin du
réseau et aucune page ne contacte Google. Ils servent aussi à l'image de partage (`scripts/og-image.html`).

Ce sont les fichiers WOFF2 de Google Fonts, sans aucune modification : polices variables découpées par Google en
sous-ensembles (un fichier par écriture), téléchargés depuis `fonts.gstatic.com` (API CSS2, 27/09/2026), identiques
octet pour octet à ceux que `next/font/google` récupérait au build.

| Fichier | Police | Sous-ensemble | Taille |
| --- | --- | --- | --- |
| `Fredoka-latin.woff2` | Fredoka 2.001 (v17), axe wght 300–700 | latin (préchargé) | 29,0 Ko |
| `Fredoka-latin-ext.woff2` | idem | latin étendu | 4,5 Ko |
| `Fredoka-hebrew.woff2` | idem | hébreu | 8,6 Ko |
| `Nunito-latin.woff2` | Nunito 3.602 (v32), axe wght 200–1000 | latin (préchargé) | 38,2 Ko |
| `Nunito-latin-ext.woff2` | idem | latin étendu | 34,6 Ko |
| `Nunito-vietnamese.woff2` | idem | vietnamien | 12,7 Ko |
| `Nunito-cyrillic.woff2` | idem | cyrillique | 20,3 Ko |
| `Nunito-cyrillic-ext.woff2` | idem | cyrillique étendu | 28,2 Ko |

Une page en français ne télécharge que les deux fichiers latins (67 Ko, préchargés) ; les autres ne se chargent que si
un texte contient un caractère de leur plage (`unicode-range`).

Licence : SIL Open Font License, version 1.1 (https://openfontlicense.org), qui autorise la redistribution avec l'avis
de copyright. Textes des licences, repris du dépôt google/fonts (`ofl/fredoka/OFL.txt`, `ofl/nunito/OFL.txt`) :

- `OFL-Fredoka.txt` : Copyright 2016 The Fredoka Project Authors (https://github.com/hafontia/Fredoka-One).
- `OFL-Nunito.txt` : Copyright 2014 The Nunito Project Authors (https://github.com/googlefonts/nunito).

Mettre à jour une police : télécharger la feuille
`https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600&family=Nunito:wght@200..1000` avec l'agent d'un
navigateur récent (sinon Google répond en TTF), remplacer les fichiers de même sous-ensemble et reporter les éventuelles
nouvelles plages `unicode-range` dans `index.ts` (latin) et `faces.css` (autres sous-ensembles).
