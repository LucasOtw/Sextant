import { NextResponse } from "next/server";
import { WORK_ID } from "@/lib/favorites-shared";
import { isPublicPdfUrl, openAccessPdfUrls } from "@/lib/format";
import { getWork } from "@/lib/openalex";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { recover } from "@/lib/log";

export const runtime = "nodejs";
/** Un PDF de 30 Mo à 1 Mo/s : on laisse le temps au flux. */
export const maxDuration = 60;

const MAX_BYTES = 60 * 1024 * 1024;
/** Budget pour trouver une copie lisible ; le reste de `maxDuration` sert au flux. */
const SEARCH_BUDGET_MS = 40_000;

/**
 * Relais de lecture d'un PDF **en accès ouvert** (l'adresse vient d'OpenAlex, jamais du client), pour l'afficher dans
 * le lecteur intégré malgré les en-têtes anti-intégration des éditeurs. Flux direct, cache court, aucun stockage.
 * Rien n'est contourné : sans version libre connue, la réponse est 404.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("work") ?? "";
  if (!WORK_ID.test(id)) return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  // Adresse canonique : un paramètre ajouté ne doit pas relancer la fonction en contournant le cache CDN.
  if (url.search !== canonicalSearch(id)) return NextResponse.redirect(new URL(`/api/pdf${canonicalSearch(id)}`, url), 308);
  if (!rateLimit(`pdf:${clientIp(req)}`, 30, 60_000)) return NextResponse.json({ error: "Trop de requêtes, réessayez dans une minute." }, { status: 429 });

  const work = await getWork(id).catch(recover("pdf.getWork", null, { work: id }));
  if (!work) return NextResponse.json({ error: "Article introuvable." }, { status: 404 });
  const candidates = openAccessPdfUrls(work).slice(0, 5);
  if (candidates.length === 0) return NextResponse.json({ error: "Pas de PDF en accès ouvert pour cet article." }, { status: 404 });

  // Les éditeurs refusent souvent un robot ; les dépôts (arXiv, HAL, PMC…) sont plus ouverts : on essaie chaque copie.
  const opened = await openFirstPdf(candidates, Date.now() + SEARCH_BUDGET_MS);
  if (!opened) return NextResponse.json({ error: "Aucune copie libre n'a pu être lue chez ses hébergeurs." }, { status: 502 });
  const { upstream, reader, first } = opened;
  // Sans compression amont (accept-encoding: identity), la longueur annoncée est celle du corps relayé.
  const encoding = upstream.headers.get("content-encoding");
  const length = !encoding || encoding === "identity" ? Number(upstream.headers.get("content-length") ?? 0) : 0;
  if (length > MAX_BYTES) {
    reader.cancel().catch(() => undefined);
    return NextResponse.json({ error: "PDF trop volumineux pour le lecteur intégré." }, { status: 413 });
  }
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(first.value);
      sent += first.value.byteLength;
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) return controller.close();
      sent += value.byteLength;
      if (sent > MAX_BYTES) {
        controller.error(new Error("PDF trop volumineux."));
        return reader.cancel();
      }
      controller.enqueue(value);
    },
    cancel() {
      return reader.cancel();
    },
  });

  const headers = new Headers({
    "x-sextant-source": new URL(upstream.url).host,
    "content-type": "application/pdf",
    "content-disposition": `inline; filename="${id}.pdf"`,
    "cache-control": "public, max-age=3600, s-maxage=86400",
    "x-content-type-options": "nosniff",
  });
  if (length) headers.set("content-length", String(length));
  return new Response(body, { headers });
}

/**
 * Sonde pour la fiche article : 204 si une copie libre est relayable, 404 sinon. Le corps n'est pas envoyé.
 * Mis en cache au bord (un jour) : une sonde par article, pas une par visiteur.
 */
export async function HEAD(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("work") ?? "";
  if (!WORK_ID.test(id)) return new Response(null, { status: 400 });
  if (url.search !== canonicalSearch(id)) return new Response(null, { status: 308, headers: { location: `/api/pdf${canonicalSearch(id)}` } });
  // Seau distinct du GET : une rafale de sondes ne doit pas bloquer la lecture.
  if (!rateLimit(`pdf-head:${clientIp(req)}`, 60, 60_000)) return new Response(null, { status: 429, headers: { "retry-after": "60" } });
  const work = await getWork(id).catch(recover("pdf.head.getWork", null, { work: id }));
  const candidates = work ? openAccessPdfUrls(work).slice(0, 5) : [];
  if (candidates.length === 0) return new Response(null, { status: 404, headers: { "cache-control": "public, max-age=600, s-maxage=86400" } });
  const opened = await openFirstPdf(candidates, Date.now() + 25_000);
  if (!opened) return new Response(null, { status: 404, headers: { "cache-control": "public, max-age=600, s-maxage=3600" } });
  opened.reader.cancel().catch(() => undefined);
  return new Response(null, { status: 204, headers: { "cache-control": "public, max-age=3600, s-maxage=86400", "x-sextant-source": new URL(opened.upstream.url).host } });
}

function canonicalSearch(id: string): string {
  return `?work=${id}`;
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 Sextant/1.0 (+https://sextant-psi.vercel.app)";

/**
 * Première adresse qui répond par un vrai PDF (signature `%PDF` vérifiée avant de promettre quoi que ce soit).
 * Le délai ne couvre que l'attente des en-têtes et du premier octet : une fois la copie validée, le flux n'est plus borné
 * que par `maxDuration`. L'hôte final (après redirections) est revalidé.
 */
async function openFirstPdf(urls: string[], deadline: number) {
  for (const url of urls) {
    const left = deadline - Date.now();
    if (left < 2_000) break;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.min(12_000, left));
    try {
      const upstream = await fetch(url, {
        headers: { accept: "application/pdf,*/*;q=0.8", "accept-encoding": "identity", "user-agent": UA },
        redirect: "follow",
        signal: ctrl.signal,
      });
      if (!upstream.ok || !upstream.body || !isPublicPdfUrl(upstream.url)) {
        upstream.body?.cancel().catch(() => undefined);
        continue;
      }
      const reader = upstream.body.getReader();
      const first = await reader.read();
      const head = first.value ? new TextDecoder("latin1").decode(first.value.subarray(0, 8)) : "";
      if (!first.done && head.startsWith("%PDF") && first.value) {
        clearTimeout(timer);
        return { upstream, reader, first: first as { value: Uint8Array } };
      }
      reader.cancel().catch(() => undefined);
    } catch {
      /* hébergeur suivant */
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
