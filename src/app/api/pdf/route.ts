import { NextResponse } from "next/server";
import { WORK_ID } from "@/lib/favorites-shared";
import { openAccessPdfUrls } from "@/lib/format";
import { getWork } from "@/lib/openalex";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
/** Un PDF de 30 Mo à 1 Mo/s : on laisse le temps au flux. */
export const maxDuration = 60;

const MAX_BYTES = 60 * 1024 * 1024;

/**
 * Relais de lecture d'un PDF **en accès ouvert** (l'adresse vient d'OpenAlex, jamais du client), pour l'afficher dans
 * le lecteur intégré malgré les en-têtes anti-intégration des éditeurs. Flux direct, cache court, aucun stockage.
 * Rien n'est contourné : sans version libre connue, la réponse est 404.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("work") ?? "";
  if (!WORK_ID.test(id)) return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!rateLimit(`pdf:${ip}`, 30, 60_000)) return NextResponse.json({ error: "Trop de requêtes, réessayez dans une minute." }, { status: 429 });

  const work = await getWork(id).catch(() => null);
  if (!work) return NextResponse.json({ error: "Article introuvable." }, { status: 404 });
  const candidates = openAccessPdfUrls(work).slice(0, 5);
  if (candidates.length === 0) return NextResponse.json({ error: "Pas de PDF en accès ouvert pour cet article." }, { status: 404 });

  // Les éditeurs refusent souvent un robot ; les dépôts (arXiv, HAL, PMC…) sont plus ouverts : on essaie chaque copie.
  const opened = await openFirstPdf(candidates);
  if (!opened) return NextResponse.json({ error: "Aucune copie libre n'a pu être lue chez ses hébergeurs." }, { status: 502 });
  const { upstream, reader, first } = opened;
  const length = Number(upstream.headers.get("content-length") ?? 0);
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

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 Sextant/1.0 (+https://sextant-psi.vercel.app)";

/** Première adresse qui répond par un vrai PDF (signature `%PDF` vérifiée avant de promettre quoi que ce soit). */
async function openFirstPdf(urls: string[]) {
  for (const url of urls) {
    try {
      const upstream = await fetch(url, {
        headers: { accept: "application/pdf,*/*;q=0.8", "user-agent": UA },
        redirect: "follow",
        signal: AbortSignal.timeout(12_000),
      });
      if (!upstream.ok || !upstream.body) continue;
      const reader = upstream.body.getReader();
      const first = await reader.read();
      const head = first.value ? new TextDecoder("latin1").decode(first.value.subarray(0, 8)) : "";
      if (!first.done && head.startsWith("%PDF") && first.value) return { upstream, reader, first: first as { value: Uint8Array } };
      reader.cancel().catch(() => undefined);
    } catch {
      /* hébergeur suivant */
    }
  }
  return null;
}
