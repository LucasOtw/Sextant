import { summarizeCspReport } from "@/lib/csp";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { rejectLargeBody } from "@/lib/security";

export const runtime = "nodejs";

/**
 * Collecte des rapports de la CSP en Report-Only (SEC-03, src/proxy.ts) : une ligne JSON par violation dans les
 * journaux Vercel, pour décider du passage en mode bloquant. Rien n'est stocké. Seuls la directive et les origines
 * sont gardées : jamais l'adresse complète de la page (une liste partagée porte son jeton dans l'adresse).
 */
export async function POST(req: Request) {
  const refused = rejectLargeBody(req, 16_384);
  if (refused) return new Response(null, { status: 413 });
  // Un navigateur envoie un rapport par violation : on en garde assez pour voir un motif, pas une rafale.
  if (!rateLimit(`csp:${clientIp(req)}`, 20, 60_000)) return new Response(null, { status: 204 });
  let body: unknown;
  try {
    body = JSON.parse((await req.text()).slice(0, 16_384));
  } catch {
    return new Response(null, { status: 204 });
  }
  const report = ((body as { "csp-report"?: unknown } | null)?.["csp-report"] ?? null) as Record<string, unknown> | null;
  if (report && typeof report === "object") console.warn(JSON.stringify(summarizeCspReport(report)));
  return new Response(null, { status: 204 });
}
