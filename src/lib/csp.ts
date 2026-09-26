/**
 * Politique de sécurité du contenu (SEC-03). Pure, sans import serveur : utilisée par src/proxy.ts et testée seule.
 *
 * Posée pour l'instant en `Content-Security-Policy-Report-Only` : rien n'est bloqué, les violations remontent dans la
 * console et, en production, vers /api/csp-report (journaux Vercel). Une fois quelques jours de rapports lus sans
 * surprise, passer l'en-tête en `Content-Security-Policy` dans src/proxy.ts.
 *
 * Ce que la page doit pouvoir charger :
 * - scripts : ceux de Next (nonce posé par Next lui-même) et le script de thème (nonce passé par layout.tsx) ;
 *   `'strict-dynamic'` autorise ce qu'ils chargent ensuite (morceaux Next, `apis.google.com/js/api.js` chargé par
 *   Firebase Auth pour sa fenêtre Google). `https://apis.google.com` reste pour les navigateurs sans strict-dynamic ;
 * - Firebase Auth : iframe cachée sur `<projet>.firebaseapp.com` (ou le domaine d'auth personnalisé), appels à
 *   identitytoolkit et securetoken ; la fenêtre Google elle-même est une fenêtre à part, hors CSP ;
 * - lecteur PDF.js : worker et ressources sous /pdfjs (même origine), `blob:` pour ses workers et images ;
 * - repli `<object data>` du lecteur vers le PDF de l'hébergeur (n'importe quel hôte https) ;
 * - avatars Google (`*.googleusercontent.com`) ; polices servies par Next depuis le site (next/font).
 */
export interface CspOptions {
  nonce: string;
  /** Développement : `'unsafe-eval'` (piles d'erreur de React) et WebSocket du rechargement à chaud. */
  dev: boolean;
  /** Projet Firebase (NEXT_PUBLIC_FIREBASE_PROJECT_ID) : hôte de l'iframe d'authentification. */
  firebaseProject?: string;
  /** Domaine d'auth personnalisé (NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN), s'il est défini. */
  authDomain?: string;
  /** Adresse de collecte des rapports (production seulement). */
  reportUri?: string;
}

export function buildCsp({ nonce, dev, firebaseProject, authDomain, reportUri }: CspOptions): string {
  const authFrames = [firebaseProject && `https://${firebaseProject}.firebaseapp.com`, authDomain?.trim() && `https://${authDomain.trim()}`].filter(Boolean);
  const directives: [string, ...string[]][] = [
    ["default-src", "'self'"],
    ["script-src", "'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "https://apis.google.com", ...(dev ? ["'unsafe-eval'"] : [])],
    // Styles en ligne : attributs `style` de React, feuilles injectées par Sonner et Base UI. Pas de nonce ici, sinon
    // 'unsafe-inline' serait ignoré.
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", "'self'", "data:", "blob:", "https://*.googleusercontent.com"],
    ["font-src", "'self'", "data:"],
    ["connect-src", "'self'", "https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com", "https://apis.google.com", ...(dev ? ["ws:"] : [])],
    ["frame-src", "'self'", ...(authFrames as string[]), "https://accounts.google.com"],
    ["worker-src", "'self'", "blob:"],
    ["object-src", "'self'", "https:"],
    ["media-src", "'self'"],
    ["manifest-src", "'self'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'self'"],
  ];
  if (reportUri) directives.push(["report-uri", reportUri]);
  return directives.map((d) => d.join(" ")).join("; ");
}

/** Nonce aléatoire (128 bits, base64), un par requête. */
export function makeNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/** Résumé sans donnée personnelle d'un rapport `application/csp-report`. */
export function summarizeCspReport(report: Record<string, unknown>) {
  return {
    level: "warn",
    scope: "csp.report",
    directive: text(report["effective-directive"] ?? report["violated-directive"], 60),
    blocked: origin(report["blocked-uri"]),
    source: origin(report["source-file"]),
    // Premier segment du chemin seulement (« /liste », « /article ») : le reste peut être un jeton ou un identifiant.
    page: pageSection(report["document-uri"]),
    disposition: text(report.disposition, 10),
  };
}

function text(v: unknown, max: number): string | undefined {
  return typeof v === "string" ? v.slice(0, max) : undefined;
}

/** `inline`, `eval`, `data`, `blob`… tels quels ; une adresse réduite à son origine. */
function origin(v: unknown): string | undefined {
  if (typeof v !== "string" || !v) return undefined;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? u.origin : u.protocol.replace(/:$/, "");
  } catch {
    return v.slice(0, 20);
  }
}

function pageSection(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  try {
    return `/${new URL(v).pathname.split("/")[1] ?? ""}`;
  } catch {
    return undefined;
  }
}
