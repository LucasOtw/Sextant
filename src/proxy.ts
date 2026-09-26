import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, makeNonce, STATIC_PAGES } from "@/lib/csp";
import { PRE_HYDRATION_SCRIPT_HASH } from "@/lib/pre-hydration";
import { SESSION_COOKIE, SESSION_HINT_COOKIE, sessionHintFix, setSessionHint } from "@/lib/session-shared";
import { THEMES } from "@/lib/themes";

const THEME_SLUGS = new Set(THEMES.map((t) => t.slug));

/**
 * Pages rendues à chaque requête, les seules où Next pose le nonce sur ses scripts. Toute autre adresse passée par le
 * proxy aboutit à la 404 prérendue (adresse inconnue, thème inconnu refusé dès le routage) : elle reçoit la politique
 * sans nonce des pages en cache, sinon chaque 404 enverrait des rapports de violation. À tenir à jour avec les pages
 * dynamiques (une page oubliée ici fonctionne, avec la politique des pages en cache).
 */
export function isRenderedOnRequest(pathname: string): boolean {
  const p = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  if (/^\/(?:search|favoris|citations|compte|retours)$/.test(p)) return true;
  if (/^\/(?:article\/[^/]+(?:\/lire)?|liste\/[^/]+)$/.test(p)) return true;
  const theme = /^\/theme\/([^/]+)$/.exec(p);
  return Boolean(theme && THEME_SLUGS.has(theme[1]));
}

/**
 * CSP à nonce (SEC-03, étape 2), en Report-Only : un nonce neuf par page, transmis à Next par l'en-tête de REQUÊTE
 * `content-security-policy` (Next y lit le nonce et l'ajoute à ses propres scripts). Surtout pas sous le nom
 * `content-security-policy-report-only` : sur Vercel, cet en-tête de requête n'atteint pas le rendu (il marche avec
 * `next start`), et les scripts de Next partaient sans nonce, avec une vingtaine de rapports de violation par page.
 * Le navigateur, lui, ne reçoit que la version Report-Only (en-tête de RÉPONSE). Le script d'avant
 * hydratation est autorisé par son empreinte. Les pages en cache (STATIC_PAGES de lib/csp.ts) ne passent ici que pour
 * rattraper l'indice de connexion (seconde entrée du `matcher`) : leur politique, sans nonce, est posée par
 * next.config.ts avec les autres en-têtes de sécurité fixes. La 404
 * prérendue, elle, passe ici et reçoit cette même politique sans nonce (`isRenderedOnRequest`).
 *
 * Au passage, l'indice de connexion lisible par le navigateur est accordé au cookie de session (PERF-01) : posé pour
 * une session ouverte avant son introduction, effacé quand la session a disparu. Sans vérification ici : les routes
 * vérifient la session elle-même, l'indice ne donne aucun droit.
 */
/**
 * Nonce désactivé par défaut (CSP_NONCE=1 pour le réessayer, par exemple après une montée de Next). Mesuré en
 * production le 26/09 : la politique porte le nonce, mais le HTML servi par Vercel n'a aucun attribut `nonce`, que la
 * politique soit transmise à Next sous `content-security-policy` ou sous `content-security-policy-report-only`
 * (Turbopack dans le mode de déploiement de Vercel, cf. vercel/next.js#96063 ; `next start` en local le pose bien).
 * Chaque page rendue à la demande envoyait alors une vingtaine de rapports de violation. Sans nonce, toutes les pages
 * ont la politique des pages en cache ('unsafe-inline' pour les scripts), toujours en Report-Only.
 */
function nonceEnabled(): boolean {
  return process.env.CSP_NONCE === "1";
}

export function proxy(request: NextRequest) {
  // Page en cache, atteinte par la seconde entrée du `matcher` (session présente, indice absent) : l'indice seul est
  // posé, sans CSP ni nonce (la politique vient de next.config.ts), et la page reste servie depuis le cache.
  if ((STATIC_PAGES as readonly string[]).includes(request.nextUrl.pathname)) {
    const response = NextResponse.next();
    const fix = sessionHintFix(request.cookies.has(SESSION_COOKIE), request.cookies.get(SESSION_HINT_COOKIE)?.value);
    if (fix !== null) setSessionHint(response, fix);
    return response;
  }
  const nonce = nonceEnabled() && isRenderedOnRequest(request.nextUrl.pathname) ? makeNonce() : null;
  const csp = buildCsp({
    nonce,
    scriptHashes: nonce ? [PRE_HYDRATION_SCRIPT_HASH] : [],
    dev: process.env.NODE_ENV === "development",
    firebaseProject: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    // En développement, la console suffit : pas de rapports envoyés au serveur local.
    reportUri: process.env.NODE_ENV === "production" ? "/api/csp-report" : undefined,
  });
  const requestHeaders = new Headers(request.headers);
  if (nonce) requestHeaders.set("content-security-policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy-report-only", csp);
  const fix = sessionHintFix(request.cookies.has(SESSION_COOKIE), request.cookies.get(SESSION_HINT_COOKIE)?.value);
  if (fix !== null) setSessionHint(response, fix);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages rendues à la demande seulement : ni pages en cache (/, /a-propos, /conditions, /confidentialite,
      // /mentions-legales : STATIC_PAGES), ni API, ni fichiers statiques (Next, PDF.js, icônes, manifeste, robots), ni
      // pages d'aide Firebase relayées (/__/auth/*), ni préchargements RSC du routeur de Next (`next-router-prefetch`).
      // Un document préchargé ou prérendu par le navigateur (`Purpose: prefetch` : <link rel=prefetch>, règles de
      // spéculation, barre d'adresse) passe, lui, par le proxy : il sera affiché tel quel et doit porter son nonce et
      // sa politique, comme une navigation normale.
      source:
        "/((?!$|a-propos$|conditions$|confidentialite$|mentions-legales$|api/|_next/static|_next/image|pdfjs/|__/auth/|favicon\\.ico|robots\\.txt|manifest\\.webmanifest|.*\\.(?:png|svg|ico|jpg|webp|txt|xml|mjs|js|css|map)$).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
    {
      // Pages en cache (STATIC_PAGES), seulement pour rattraper l'indice d'une session ouverte avant son introduction :
      // sans cela, un connecté revenu par l'accueil y paraîtrait anonyme jusqu'à sa première page dynamique. Les
      // autres requêtes vers ces pages (anonyme, indice déjà posé, marque `0`) ne passent pas par la fonction. Noms
      // en toutes lettres : Next lit ce `config` sans l'exécuter (SESSION_COOKIE et SESSION_HINT_COOKIE).
      source: "/((?:a-propos|conditions|confidentialite|mentions-legales)?)",
      has: [{ type: "cookie", key: "sextant_session" }],
      missing: [{ type: "cookie", key: "sextant_signed_in" }],
    },
  ],
};
