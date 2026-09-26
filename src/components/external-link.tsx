/**
 * Lien vers un autre site, ouvert dans un nouvel onglet. Le lecteur d'écran l'entend à la fin du nom (« OpenAlex (nouvel
 * onglet) ») : le libellé visible reste en tête (WCAG 2.5.3), et le changement d'onglet, où Retour ne ramène plus ici,
 * n'arrive plus sans prévenir (A11Y-35). Un lien dont le texte visible dit déjà « nouvel onglet » garde un `<a>` simple.
 */
export function ExternalLink({ children, ...props }: Omit<React.ComponentProps<"a">, "target" | "rel">) {
  return (
    <a {...props} target="_blank" rel="noreferrer">
      {children}
      <span className="sr-only"> (nouvel onglet)</span>
    </a>
  );
}
