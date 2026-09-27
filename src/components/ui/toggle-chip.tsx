import { cva } from "class-variance-authority"
import { cn } from "@/lib/cn"

/*
 * Puce d'état sélectionné (C16, étape 17) : navigation active de l'en-tête, filtres des retours, listes des favoris,
 * sujet actif d'une thématique. L'élément actif est une « puce active » douce, pour ne plus ressembler au bouton plein :
 * teinte bleue, bordure et texte bleu foncé, Nunito 700. Contrastes : texte #3E54B8 sur #EAEDF9 à 5,68:1, bordure à
 * 6,24:1 sur le fond (sombre : #8FA1EA sur #20284A à 5,78:1, bordure à 7,60:1). Inactif : carte et filet (outline) ou
 * sans fond (ghost, navigation), en 600.
 * L'état est dit par aria-pressed (bouton) ou aria-current (lien) ; data-active porte le repère des couleurs forcées
 * (globals.css : fond de sélection système, bordure de 2 px et soulignement).
 */
const toggleChipCva = cva(
  "inline-flex max-w-full shrink-0 items-center justify-center gap-1.5 rounded-full border whitespace-nowrap transition-[background-color,color,border-color] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      active: {
        true: "border-link bg-tint font-bold text-link",
        false: "font-semibold",
      },
      appearance: {
        /** Carte et filet au repos : filtres, listes, sujets. */
        outline: "",
        /** Sans fond au repos : navigation de l'en-tête. */
        ghost: "",
      },
      size: {
        default: "h-9 px-3.5 text-sm",
        /** Libellé qui peut passer à la ligne (sujets OpenAlex, parfois longs). */
        wrap: "min-h-8 px-3 py-1 text-sm whitespace-normal",
        nav: "min-h-9 px-3.5 py-1 text-(length:--text-meta)",
        icon: "size-9",
      },
    },
    compoundVariants: [
      {
        active: false,
        appearance: "outline",
        class: "border-border bg-card text-foreground hover:border-[color-mix(in_oklch,var(--brand)_40%,var(--border))]",
      },
      {
        active: false,
        appearance: "ghost",
        class: "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
      },
    ],
    defaultVariants: {
      active: false,
      appearance: "outline",
      size: "default",
    },
  }
)

type ChipOptions = {
  active: boolean
  appearance?: "outline" | "ghost"
  size?: "default" | "wrap" | "nav" | "icon"
  className?: string
}

/**
 * Attributs d'une puce posée sur un autre élément (lien de navigation, lien de filtre) : classes, data-slot et
 * data-active. L'état ARIA (aria-current) reste à la charge de l'élément, qui seul sait s'il désigne la page ou un filtre.
 */
function toggleChip({ active, appearance, size, className }: ChipOptions) {
  return {
    "data-slot": "toggle-chip",
    "data-active": active ? "true" : undefined,
    className: cn(toggleChipCva({ active, appearance, size }), className),
  }
}

/** Puce bascule : un bouton à aria-pressed, pour les filtres et les listes. */
function ToggleChip({
  active,
  appearance,
  size,
  className,
  type = "button",
  ...props
}: Omit<React.ComponentProps<"button">, "aria-pressed"> & ChipOptions) {
  return <button type={type} aria-pressed={active} {...toggleChip({ active, appearance, size, className })} {...props} />
}

export { ToggleChip, toggleChip }
