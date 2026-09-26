"use client"

import * as React from "react"
import { cn } from "cn"

/** Attributs à poser sur le champ : relié au libellé (id) et à l'indication (aria-describedby). */
export interface FieldControlProps {
  id: string
  "aria-describedby"?: string
  "aria-invalid"?: true
}

interface FieldProps {
  /** Libellé visible, qui reste affiché pendant la saisie (le texte indicatif, lui, disparaît). */
  label: string
  /** Ajoute « (facultatif) » au libellé. */
  optional?: boolean
  /** Contrainte ou aide sous le champ, lue avec lui par les lecteurs d'écran. */
  hint?: React.ReactNode
  /** Saisie refusée : l'indication passe en rouge et le champ est marqué invalide. */
  invalid?: boolean
  className?: string
  children: (control: FieldControlProps) => React.ReactNode
}

/**
 * Libellé, champ et indication reliés (WCAG 1.3.1, 3.3.2) : le libellé reste visible pendant la saisie, et la
 * contrainte est lue avec le champ au lieu de rester implicite (A11Y-21).
 */
function Field({ label, optional = false, hint, invalid = false, className, children }: FieldProps) {
  const id = React.useId()
  const hintId = `${id}-hint`
  return (
    <div data-slot="field" className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {optional && <span className="font-normal text-muted-foreground"> (facultatif)</span>}
      </label>
      {children({ id, "aria-describedby": hint ? hintId : undefined, "aria-invalid": invalid || undefined })}
      {hint && (
        <p id={hintId} className={cn("text-xs", invalid ? "text-destructive" : "text-muted-foreground")}>
          {hint}
        </p>
      )}
    </div>
  )
}

export { Field }
