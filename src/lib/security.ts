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
