import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/cn"

/*
 * Boutons de la DA : pilule, Nunito 600 (700 pour le bouton plein), 13 à 16 px selon la taille. Le focus est celui de
 * tout le site (globals.css : outline de 2 px décalée de 2 px, couleur --ring), visible sur tous les fonds et en couleurs
 * forcées : aucun halo propre ici. Survols en teinte bleue (bg-accent), désactivé commun (--disabled).
 * Taille 15 px en text-(length:--text-meta) : `cn` prendrait text-meta pour une couleur et l'écraserait.
 * Sous sm, les tailles default et lg passent à la ligne plutôt que de déborder (espacement du texte agrandi, WCAG 1.4.12) :
 * la hauteur devient un minimum.
 */
const buttonCva = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding font-semibold whitespace-nowrap transition-[background-color,color,border-color] select-none motion-safe:active:not-aria-[haspopup]:translate-y-px disabled:cursor-not-allowed disabled:text-disabled-foreground aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary font-bold text-primary-foreground hover:bg-primary-hover disabled:bg-disabled",
        outline:
          "border-border bg-card text-foreground hover:bg-accent aria-expanded:bg-accent dark:border-input",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklab,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground disabled:bg-disabled",
        ghost:
          "hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 dark:bg-destructive/12 dark:hover:bg-destructive/12 dark:hover:ring-1 dark:hover:ring-destructive/50",
        /** Action destructive discrète (supprimer, révoquer, désactiver) : neutre au repos, rouge au survol. */
        "destructive-ghost":
          "text-muted-foreground hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/12",
        /** Bouton qui se présente comme un lien (style .link de globals.css) ; avec size="inline" dans une phrase. */
        link: "link",
      },
      size: {
        default:
          "h-10 gap-1.5 px-4 text-(length:--text-meta) has-data-[icon=inline-end]:pr-3.5 has-data-[icon=inline-start]:pl-3.5 max-sm:h-auto max-sm:min-h-10 max-sm:max-w-full max-sm:py-2 max-sm:text-center max-sm:whitespace-normal",
        xs: "h-8 gap-1 px-3 text-xs has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-9 gap-1.5 px-3.5 text-sm has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        lg: "h-11 gap-2 px-5 text-base has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4 max-sm:h-auto max-sm:min-h-11 max-sm:max-w-full max-sm:py-2 max-sm:text-center max-sm:whitespace-normal",
        icon: "size-10",
        "icon-xs": "size-8 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-9",
        "icon-lg": "size-11",
        /** Dans le fil du texte : ni hauteur, ni marge, ni graisse ou taille propres. */
        inline: "h-auto gap-1 rounded-xs border-0 p-0 align-baseline font-normal text-[length:inherit] whitespace-normal",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * Classes fusionnées par `cn` : sur un lien stylé en bouton (buttonVariants), la bordure transparente de la base et celle
 * de la variante coexisteraient sinon, et l'ordre de la feuille de style déciderait (contour du bouton outline perdu).
 */
function buttonVariants(props?: Parameters<typeof buttonCva>[0]) {
  return cn(buttonCva(props))
}

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonCva>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={buttonVariants({ variant, size, className })}
      {...props}
    />
  )
}

export { Button, buttonVariants }
