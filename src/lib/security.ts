import "server-only";
import { NextResponse } from "next/server";

/**
 * Refuse les requêtes d'écriture venues d'un autre site (protection CSRF, y compris « login CSRF »
 * sur l'ouverture de session). Les navigateurs modernes envoient Sec-Fetch-Site ; à défaut, on compare Origin à Host.
 */
export function rejectCrossSite(req: Request): NextResponse | null {
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return NextResponse.json({ error: "Requête refusée." }, { status: 403 });
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return NextResponse.json({ error: "Requête refusée." }, { status: 403 });
    } catch {
      return NextResponse.json({ error: "Requête refusée." }, { status: 403 });
    }
  }
  return null;
}

/**
 * Refuse un corps annoncé trop gros avant de le lire : nos écritures pèsent quelques Ko au plus. Une longueur illisible
 * ou négative est refusée aussi. Un corps envoyé sans longueur (flux « chunked ») n'est pas lu ici : il reste plafonné
 * par la plateforme (4,5 Mo sur Vercel), coût jugé négligeable (SEC-17).
 */
export function rejectLargeBody(req: Request, maxBytes = 16_384): NextResponse | null {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declared) || declared < 0 || declared > maxBytes) return NextResponse.json({ error: "Requête trop volumineuse." }, { status: 413 });
  return null;
}
