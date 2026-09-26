/**
 * Page du lecteur PDF en haut de l'écran : la première dont le bas passe sous `top` (hauteur de l'en-tête collant).
 * Les pages sont empilées dans l'ordre : recherche dichotomique, une vingtaine de mesures au plus pour 300 pages, ce
 * qui permet de la suivre au défilement. Numéro lu dans `data-page` ; 1 sans page.
 */
export function pageAtTop(pages: ArrayLike<HTMLElement>, top = 96): number {
  let lo = 0;
  let hi = pages.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (pages[mid].getBoundingClientRect().bottom > top) {
      found = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  const el = found >= 0 ? pages[found] : pages[pages.length - 1];
  return Number(el?.dataset.page) || 1;
}

/**
 * Numéro saisi dans le champ « Page » du choix de phrases : la page si elle existe, sinon le message à afficher à la
 * place des phrases (champ vide, texte, page hors de 1..numPages).
 */
export function parsePickerPage(input: string, numPages: number): { page: number } | { error: string } {
  const n = Number(input);
  if (input.trim() && Number.isInteger(n) && n >= 1 && n <= numPages) return { page: n };
  const range = `entre 1 et ${numPages}`;
  return { error: input.trim() ? `La page doit être comprise ${range}.` : `Indiquez un numéro de page, ${range}.` };
}
