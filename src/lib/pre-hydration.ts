/**
 * Script exécuté avant le premier rendu (layout.tsx), sans dépendance : pur, partagé avec le proxy et les tests.
 * - thème mémorisé (ou celui du système), pour éviter le flash blanc ;
 * - indice de connexion (`sextant_signed_in`, cf. lib/session-shared.ts) reporté sur <html data-session> : les pages
 *   en cache, identiques pour tous, montrent d'emblée la place de l'avatar à un connecté et « Se connecter » à un
 *   anonyme, avant l'hydratation (PERF-01).
 *
 * Autorisé par la CSP au moyen de son empreinte (PRE_HYDRATION_SCRIPT_HASH) et non d'un nonce : le layout n'a plus à
 * lire les en-têtes de la requête, ce qui laisse les pages sans données personnelles se mettre en cache. Toute
 * modification du script doit s'accompagner de la nouvelle empreinte (tests/unit/csp.test.ts la recalcule).
 */
export const PRE_HYDRATION_SCRIPT = `(function(){var h=document.documentElement;try{var t=localStorage.getItem("theme");var d=t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches;if(d){h.classList.add("dark");h.style.colorScheme="dark"}}catch(e){}try{if(/(?:^|;\\s*)sextant_signed_in=1(?:;|$)/.test(document.cookie))h.setAttribute("data-session","1")}catch(e){}})();`;

/** Empreinte CSP du script ci-dessus (SHA-256 en base64). */
export const PRE_HYDRATION_SCRIPT_HASH = "'sha256-M91w/bxgMQdzQYLG+Seo1RI2WV9YHR9wW1eCFKLjo3Q='";
