import { NextResponse } from "next/server";
import { WORK_ID } from "@/lib/favorites-shared";
import { isPublicPdfUrl, openAccessPdfUrls } from "@/lib/format";
import { fetchPublic } from "@/lib/public-fetch";
import { getWork } from "@/lib/openalex";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { recover } from "@/lib/log";
import { isExpectedRange, parseContentRange, parseRange } from "@/lib/pdf-range";

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
 *
 * `?work=W…` : le fichier entier (mis en cache au bord). `?work=W…&c=i` avec un en-tête `Range: bytes=a-b` : une plage,
 * lue chez la copie n° i, celle qui a servi le fichier entier (en-tête `x-sextant-candidate`), jamais mise en cache
 * (PERF-06, cf. lib/pdf-range.ts).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("work") ?? "";
  if (!WORK_ID.test(id)) return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  const candidate = url.searchParams.get("c");
  if (candidate !== null && !/^[0-4]$/.test(candidate)) return NextResponse.json({ error: "Copie invalide." }, { status: 400 });
  // Adresse canonique : un paramètre ajouté ne doit pas relancer la fonction en contournant le cache CDN.
  if (url.search !== canonicalSearch(id, candidate)) return NextResponse.redirect(new URL(`/api/pdf${canonicalSearch(id, candidate)}`, url), 308);
  if (candidate !== null) return rangeResponse(req, id, Number(candidate));
  if (!rateLimit(`pdf:${clientIp(req)}`, 30, 60_000)) return NextResponse.json({ error: "Trop de requêtes, réessayez dans une minute." }, { status: 429 });

  // `undefined` = OpenAlex en panne : ce n'est pas un article absent, et la réponse ne doit pas rester en cache.
  const work = await getWork(id).catch(recover("pdf.getWork", undefined, { work: id }));
  if (work === undefined) {
    return NextResponse.json({ error: "Source momentanément indisponible, réessayez." }, { status: 503, headers: { "cache-control": "no-store", "retry-after": "60" } });
  }
  if (!work) return NextResponse.json({ error: "Article introuvable." }, { status: 404 });
  const candidates = openAccessPdfUrls(work).slice(0, 5);
  if (candidates.length === 0) return NextResponse.json({ error: "Pas de PDF en accès ouvert pour cet article." }, { status: 404 });

  // Les éditeurs refusent souvent un robot ; les dépôts (arXiv, HAL, PMC…) sont plus ouverts : on essaie chaque copie.
  const opened = await openFirstPdf(candidates, Date.now() + SEARCH_BUDGET_MS);
  if (!opened) return NextResponse.json({ error: "Aucune copie libre n'a pu être lue chez ses hébergeurs." }, { status: 502 });
  const { upstream, reader, first, index } = opened;
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
    "x-sextant-candidate": String(index),
    "content-type": "application/pdf",
    "content-disposition": `inline; filename="${id}.pdf"`,
    "cache-control": "public, max-age=3600, s-maxage=86400",
    "x-content-type-options": "nosniff",
  });
  if (length) headers.set("content-length", String(length));
  // L'hébergeur accepte les plages et la taille est connue : le lecteur pourra demander des morceaux (PERF-06).
  if (length && /\bbytes\b/i.test(upstream.headers.get("accept-ranges") ?? "")) headers.set("x-sextant-ranges", "1");
  return new Response(body, { headers });
}

/**
 * Une plage du PDF, pour le lecteur (PERF-06) : relayée seulement si l'hébergeur répond 206 avec exactement la plage
 * demandée ; jamais le fichier entier à la place (le lecteur l'écrirait à l'endroit de la plage). Réponse privée, non
 * mise en cache. Limite de débit à part : une lecture en demande quelques dizaines.
 */
async function rangeResponse(req: Request, id: string, index: number): Promise<Response> {
  const noStore = { "cache-control": "private, no-store" };
  const range = parseRange(req.headers.get("range"));
  if (!range) return NextResponse.json({ error: "Plage invalide." }, { status: 416, headers: noStore });
  if (!rateLimit(`pdfr:${clientIp(req)}`, 300, 60_000)) return NextResponse.json({ error: "Trop de requêtes, réessayez dans une minute." }, { status: 429, headers: noStore });
  const work = await getWork(id).catch(recover("pdf.range.getWork", undefined, { work: id }));
  const target = work ? openAccessPdfUrls(work).slice(0, 5)[index] : undefined;
  if (!target) return NextResponse.json({ error: "Copie introuvable." }, { status: 404, headers: noStore });

  const signal = AbortSignal.timeout(20_000);
  let upstream: Awaited<ReturnType<typeof fetchPublic>>;
  try {
    upstream = await fetchPublic(target, {
      headers: { accept: "application/pdf,*/*;q=0.8", "accept-encoding": "identity", "user-agent": UA, range: `bytes=${range.start}-${range.end}` },
      signal,
      isAllowed: isPublicPdfUrl,
    });
  } catch {
    upstream = null;
  }
  const refuse = () => NextResponse.json({ error: "Plage indisponible chez l'hébergeur." }, { status: 502, headers: noStore });
  if (!upstream) return refuse();
  const cr = parseContentRange(upstream.headers.get("content-range"));
  const encoding = upstream.headers.get("content-encoding");
  if (upstream.status !== 206 || !isExpectedRange(cr, range.start, range.end) || !cr || cr.total > MAX_BYTES || (encoding && encoding !== "identity")) {
    upstream.body.cancel().catch(() => undefined);
    return refuse();
  }
  const expected = cr.end - cr.start + 1;
  const reader = upstream.body.getReader();
  let first: ReadableStreamReadResult<Uint8Array>;
  try {
    first = await reader.read();
  } catch {
    return refuse();
  }
  // Début du fichier : même contrôle de signature que pour le fichier entier.
  if (range.start === 0 && !(first.value && new TextDecoder("latin1").decode(first.value.subarray(0, 8)).startsWith("%PDF"))) {
    reader.cancel().catch(() => undefined);
    return refuse();
  }
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      if (first.done || !first.value) return controller.close();
      sent += first.value.byteLength;
      controller.enqueue(first.value);
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) return controller.close();
      sent += value.byteLength;
      if (sent > expected) {
        controller.error(new Error("Plage plus longue qu'annoncé."));
        return reader.cancel();
      }
      controller.enqueue(value);
    },
    cancel() {
      return reader.cancel();
    },
  });
  return new Response(body, {
    status: 206,
    headers: {
      ...noStore,
      "content-type": "application/pdf",
      "content-range": `bytes ${cr.start}-${cr.end}/${cr.total}`,
      "content-length": String(expected),
      "accept-ranges": "bytes",
      "x-content-type-options": "nosniff",
    },
  });
}

/**
 * Sonde pour la fiche article, toujours en 204 (corps vide) : l'en-tête `x-sextant-readable` dit si une copie libre
 * est relayable (« 1 ») ou non (« 0 »). Une réponse 404 ici était attendue mais s'affichait comme une erreur dans la
 * console du navigateur (et dans les audits Lighthouse). Mis en cache au bord : une sonde par article, pas une par visiteur.
 * Le GET, lui, garde ses vrais codes d'échec (404, 502) : le lecteur en a besoin.
 */
export async function HEAD(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("work") ?? "";
  if (!WORK_ID.test(id)) return new Response(null, { status: 400 });
  if (url.search !== canonicalSearch(id)) return new Response(null, { status: 308, headers: { location: `/api/pdf${canonicalSearch(id)}` } });
  // Seau distinct du GET : une rafale de sondes ne doit pas bloquer la lecture.
  if (!rateLimit(`pdf-head:${clientIp(req)}`, 60, 60_000)) return new Response(null, { status: 429, headers: { "retry-after": "60" } });
  // `undefined` = OpenAlex en panne : on ne sait rien du PDF, et la réponse ne doit surtout pas rester un jour en cache.
  const work = await getWork(id).catch(recover("pdf.head.getWork", undefined, { work: id }));
  if (work === undefined) return new Response(null, { status: 503, headers: { "cache-control": "no-store", "retry-after": "60" } });
  const candidates = work ? openAccessPdfUrls(work).slice(0, 5) : [];
  if (candidates.length === 0) return probe(false, "public, max-age=600, s-maxage=86400");
  const opened = await openFirstPdf(candidates, Date.now() + 25_000);
  if (!opened) return probe(false, "public, max-age=600, s-maxage=3600");
  opened.reader.cancel().catch(() => undefined);
  return probe(true, "public, max-age=3600, s-maxage=86400", new URL(opened.upstream.url).host);
}

function probe(readable: boolean, cacheControl: string, source?: string): Response {
  const headers = new Headers({ "x-sextant-readable": readable ? "1" : "0", "cache-control": cacheControl });
  if (source) headers.set("x-sextant-source", source);
  return new Response(null, { status: 204, headers });
}

function canonicalSearch(id: string, candidate: string | null = null): string {
  return candidate === null ? `?work=${id}` : `?work=${id}&c=${candidate}`;
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 Sextant/1.0 (+https://sextant-psi.vercel.app)";

/**
 * Première adresse qui répond par un vrai PDF (signature `%PDF` vérifiée avant de promettre quoi que ce soit).
 * Le délai ne couvre que l'attente des en-têtes et du premier octet : une fois la copie validée, le flux n'est plus borné
 * que par `maxDuration`. Chaque saut (adresse de départ puis chaque redirection, 5 au plus) est validé AVANT d'être
 * demandé, et les adresses IP résolues doivent être publiques (fetchPublic) : jamais de requête vers l'intérieur.
 */
async function openFirstPdf(urls: string[], deadline: number) {
  for (const [index, url] of urls.entries()) {
    const left = deadline - Date.now();
    if (left < 2_000) break;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.min(12_000, left));
    try {
      const upstream = await fetchPublic(url, {
        headers: { accept: "application/pdf,*/*;q=0.8", "accept-encoding": "identity", "user-agent": UA },
        signal: ctrl.signal,
        isAllowed: isPublicPdfUrl,
      });
      if (!upstream) continue;
      if (!upstream.ok) {
        upstream.body.cancel().catch(() => undefined);
        continue;
      }
      const reader = upstream.body.getReader();
      const first = await reader.read();
      const head = first.value ? new TextDecoder("latin1").decode(first.value.subarray(0, 8)) : "";
      if (!first.done && head.startsWith("%PDF") && first.value) {
        clearTimeout(timer);
        return { upstream, reader, first: first as { value: Uint8Array }, index };
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
