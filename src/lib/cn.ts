import { createCn } from "cn/config"

/**
 * `cn` du projet : fusion des classes Tailwind (clsx + résolution des conflits) avec les tailles de police
 * personnalisées de globals.css (`--text-meta`, `--text-read`) déclarées comme telles. Sans cette extension, le paquet
 * `cn` les prend pour des couleurs et supprime `text-meta` face à `text-muted-foreground` (la classe disparaît et le
 * texte retombe à 16 px). Idem pour l'ombre `shadow-float`, qu'il confondrait avec une couleur d'ombre.
 * Toute nouvelle taille `--text-*` ou ombre `--shadow-*` du thème s'ajoute ici.
 */
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [{ text: ["meta", "read"] }],
      shadow: [{ shadow: ["float"] }],
    },
  },
})
