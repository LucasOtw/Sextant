"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFWorker, RenderTask } from "pdfjs-dist";
import { AlertTriangleIcon, ChevronDownIcon, Loader2Icon, Maximize2Icon, Minimize2Icon } from "lucide-react";
import { ArticleHighlights } from "@/components/highlights/article-highlights";
import { useHighlights } from "@/components/highlights/highlights-provider";
import { cleanSelectionText, readSelection, SelectionButton } from "@/components/highlights/selection-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { pdfjsAssetsBase } from "@/components/highlights/pdfjs-assets";
import type { Highlight } from "@/lib/highlights-shared";
import { markSpans } from "@/lib/pdf-marks";
import { cn } from "cn";

type PdfLib = typeof import("pdfjs-dist");

const GOTO_EVENT = "sextant:goto-page";
const NO_HIGHLIGHTS: Highlight[] = [];
/** Proportion A4, en attendant de connaître celle de la première page du document. */
const A4_ASPECT = 1.414;

function goToPage(page: number) {
  window.dispatchEvent(new CustomEvent(GOTO_EVENT, { detail: page }));
}

interface LayoutProps {
  url: string;
  originalUrl: string;
  /** PDF embarquable par le lecteur du navigateur si le relais échoue (https, hôte public), sinon null : lien seul. */
  embedUrl: string | null;
}

/**
 * Lecteur à gauche, « Mes surlignages » à droite (défilable) ; sur mobile, la liste se replie au-dessus du lecteur.
 * « Plein écran » passe le lecteur en plein écran (API du navigateur, ou repli fixe quand elle manque, iPhone par exemple).
 */
export function ReaderLayout({ url, originalUrl, embedUrl }: LayoutProps) {
  const { highlights } = useHighlights();
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  /** API Fullscreen disponible ? Décidé après le montage (le rendu serveur ne doit pas en dépendre). */
  const [nativeFullscreen, setNativeFullscreen] = useState(true);

  useEffect(() => {
    const onChange = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    if (typeof document.documentElement.requestFullscreen !== "function") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- capacité du navigateur, connue seulement côté client
      setNativeFullscreen(false);
    }
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Repli sans API : Échap quitte le plein écran.
  useEffect(() => {
    if (!full || nativeFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFull(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [full, nativeFullscreen]);

  async function toggleFullscreen() {
    if (full) {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
      setFull(false);
      return;
    }
    if (nativeFullscreen) {
      try {
        // Certains environnements acceptent la demande sans basculer : on vérifie, puis on se replie sur le mode fixe.
        await Promise.race([wrapRef.current?.requestFullscreen(), new Promise((r) => setTimeout(r, 400))]);
        if (document.fullscreenElement) return;
      } catch {
        /* refusé : repli */
      }
      setNativeFullscreen(false);
    }
    setFull(true);
  }

  const fallback = full && !nativeFullscreen;
  return (
    <div ref={wrapRef} className={cn("pdf-fullscreen mt-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6", fallback && "fixed inset-0 z-50 m-0 overflow-y-auto bg-background px-4 py-4 sm:px-6")}>
      {!full && (
        <div className="lg:hidden">
          <Button variant="outline" className="w-full justify-between bg-card" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="lecteur-surlignages">
            Mes surlignages{highlights.length > 0 && ` (${highlights.length})`}
            <ChevronDownIcon className={cn("transition-transform", open && "rotate-180")} />
          </Button>
        </div>
      )}
      <aside id="lecteur-surlignages" className={cn("w-full lg:order-2 lg:sticky lg:top-20 lg:block lg:max-h-[calc(100dvh-6rem)] lg:w-80 lg:shrink-0 lg:overflow-y-auto lg:pr-1", (!open || full) && "hidden", full && "lg:hidden")}>
        <ArticleHighlights compact onGoToPage={(page) => { setOpen(false); goToPage(page); }} />
      </aside>
      <div className={cn("min-w-0 flex-1 lg:order-1", full && "mx-auto w-full max-w-4xl")}>
        <div className="mb-3 flex justify-end">
          <Button variant="outline" size="sm" className="bg-card" onClick={() => void toggleFullscreen()} aria-pressed={full}>
            {full ? <Minimize2Icon /> : <Maximize2Icon />} {full ? "Quitter le plein écran" : "Plein écran"}
          </Button>
        </div>
        <PdfReader url={url} originalUrl={originalUrl} embedUrl={embedUrl} />
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
  return `${Math.max(1, Math.round(n / 1024))} Ko`;
}

/** Télécharge le PDF en entier, en signalant la progression (`total` = 0 si la taille n'est pas annoncée). */
async function downloadPdf(url: string, signal: AbortSignal, onProgress: (loaded: number, total: number) => void): Promise<Uint8Array> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // Réponse compressée : Content-Length compte les octets compressés, pas ceux lus → taille totale inconnue.
  const encoded = (res.headers.get("content-encoding") ?? "identity") !== "identity";
  const total = encoded ? 0 : Number(res.headers.get("content-length")) || 0;
  if (!res.body) {
    const bytes = new Uint8Array(await res.arrayBuffer());
    onProgress(bytes.length, total);
    return bytes;
  }
  const reader = res.body.getReader();
  // Taille annoncée : écriture directe dans un tampon préalloué (pic mémoire = taille du PDF, pas le double).
  // Sinon, ou si la réponse dépasse l'annonce, accumulation des morceaux puis copie finale.
  let buffer: Uint8Array | null = total > 0 ? new Uint8Array(total) : null;
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (buffer && loaded + value.length > buffer.length) {
      chunks.push(buffer.subarray(0, loaded));
      buffer = null;
    }
    if (buffer) buffer.set(value, loaded);
    else chunks.push(value);
    loaded += value.length;
    onProgress(loaded, total);
  }
  if (buffer) return loaded === buffer.length ? buffer : buffer.subarray(0, loaded);
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function pageOf(node: Node | null | undefined): string | undefined {
  return (node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>("[data-page]")?.dataset.page;
}

interface ReaderProps {
  url: string;
  originalUrl: string;
  embedUrl: string | null;
}

/** Affiche le PDF page par page (PDF.js) avec une couche texte sélectionnable ; une sélection propose « Surligner ». */
export function PdfReader({ url, originalUrl, embedUrl }: ReaderProps) {
  const { highlights, add } = useHighlights();
  const [lib, setLib] = useState<PdfLib | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [width, setWidth] = useState(0);
  const [defaultAspect, setDefaultAspect] = useState(A4_ASPECT);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<(NonNullable<ReturnType<typeof readSelection>> & { page: number }) | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    let worker: PDFWorker | null = null;
    const download = new AbortController();
    (async () => {
      try {
        // Le PDF part tout de suite, en parallèle du module PDF.js et du worker (au lieu d'attendre que le worker
        // le demande). /api/pdf n'annonce pas de requêtes partielles : PDF.js attendait de toute façon le fichier entier.
        const data = downloadPdf(url, download.signal, (loaded, total) => {
          if (!cancelled) setProgress({ loaded, total });
        });
        data.catch(() => undefined); // l'échec est traité plus bas, au moment d'attendre les données
        const pdfjs = await import("pdfjs-dist");
        if (cancelled) return;
        const base = pdfjsAssetsBase(pdfjs.version);
        pdfjs.GlobalWorkerOptions.workerSrc = `${base}/pdf.worker.min.mjs`;
        worker = new pdfjs.PDFWorker(); // le worker se charge pendant que le PDF finit d'arriver
        const bytes = await data;
        if (cancelled) return;
        // Ressources optionnelles de PDF.js servies depuis /public : décodeurs WebAssembly (JBIG2, JPX des scans anciens),
        // polices standard non embarquées, CMaps (CJK), profils ICC. Sans elles, les images sont ignorées et la page reste blanche.
        task = pdfjs.getDocument({
          data: bytes,
          worker,
          wasmUrl: `${base}/wasm/`,
          iccUrl: `${base}/iccs/`,
          standardFontDataUrl: `${base}/standard_fonts/`,
          cMapUrl: `${base}/cmaps/`,
          cMapPacked: true,
        });
        const d = await task.promise;
        // Hauteur provisoire des pages non rendues : proportion de la première page (comme le visualiseur PDF.js),
        // pas un A4 fixe. Sinon, sur un PDF au format Letter ou en paysage, les pages changent de hauteur en se rendant
        // et « aller à la page N » atterrit à côté. `getPage` est mis en cache par PDF.js : rien n'est lu deux fois.
        let aspect = A4_ASPECT;
        try {
          const v = (await d.getPage(1)).getViewport({ scale: 1 });
          if (v.width > 0 && v.height > 0) aspect = v.height / v.width;
        } catch {
          /* première page illisible : on garde l'A4, chaque page corrige sa hauteur en se rendant */
        }
        if (cancelled) {
          void task.destroy();
          return;
        }
        setDefaultAspect(aspect);
        setLib(pdfjs);
        setDoc(d);
      } catch (e) {
        // Cas attendu (hébergeur qui refuse le relais) : on bascule sur l'affichage natif, sans alarmer la console.
        console.info("[lecteur PDF] repli sur le PDF original :", e instanceof Error ? e.message : e);
        if (!cancelled) setError("Le PDF n'a pas pu être chargé dans le lecteur.");
      }
    })();
    return () => {
      cancelled = true;
      download.abort();
      void task?.destroy();
      worker?.destroy(); // fourni par nous : PDF.js ne le détruit pas avec le document
    };
  }, [url]);

  // Largeur de rendu : celle du conteneur, mesurée dès la mise en page (un onglet en arrière-plan ne reçoit pas de frames), puis suivie.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.floor(el.clientWidth);
      if (w > 0) setWidth(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Sélection contenue dans une seule page → bouton flottant.
  useEffect(() => {
    let clearTimer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      const el = containerRef.current;
      if (!el) return;
      const read = readSelection(el);
      const sel = window.getSelection();
      const a = pageOf(sel?.anchorNode);
      const page = Number(a);
      const ok = read && page > 0 && a === pageOf(sel?.focusNode);
      if (!ok) {
        // Un seul minuteur à la fois : un minuteur orphelin (défilement juste avant) effacerait une sélection valide.
        clearTimeout(clearTimer);
        clearTimer = setTimeout(() => setSelection(null), 300);
        return;
      }
      clearTimeout(clearTimer);
      setSelection({ ...read, text: cleanSelectionText(read.text), page });
    };
    document.addEventListener("selectionchange", update);
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      clearTimeout(clearTimer);
      document.removeEventListener("selectionchange", update);
      window.removeEventListener("scroll", update);
    };
  }, []);

  useEffect(() => {
    const onGoto = (e: Event) => {
      const page = (e as CustomEvent<number>).detail;
      // Saut instantané : un défilement doux ferait rendre les pages traversées, dont la hauteur peut changer en route
      // (documents mêlant plusieurs formats), et la cible, calculée au départ, ne serait plus au bon endroit.
      containerRef.current?.querySelector(`[data-page="${page}"]`)?.scrollIntoView({ behavior: "auto", block: "start" });
    };
    window.addEventListener(GOTO_EVENT, onGoto);
    return () => window.removeEventListener(GOTO_EVENT, onGoto);
  }, []);

  /**
   * Passages par page. Les références ne changent qu'avec les surlignages (jamais au défilement ni à la sélection) ;
   * les pages sans passage reçoivent toutes la même constante.
   */
  const byPage = useMemo(() => {
    const m = new Map<number, Highlight[]>();
    for (const h of highlights) {
      if (h.source !== "pdf" || !h.page) continue;
      m.set(h.page, [...(m.get(h.page) ?? []), h]);
    }
    return m;
  }, [highlights]);

  async function save() {
    if (!selection) return;
    setBusy(true);
    const created = await add({ source: "pdf", text: selection.text, page: selection.page, prefix: "", suffix: "", note: "" });
    setBusy(false);
    if (created) {
      window.getSelection()?.removeAllRanges();
      setSelection(null);
    }
  }

  if (error) {
    const host = (() => {
      try {
        return new URL(originalUrl).host;
      } catch {
        return "l'hébergeur";
      }
    })();
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-dashed p-5 text-[15px]">
          <p className="font-medium">Le lecteur Sextant n'a pas pu récupérer ce PDF : {host} n'accepte que les navigateurs.</p>
          <p className="mt-1 text-muted-foreground">
            {embedUrl
              ? "Il s'affiche ci-dessous avec le lecteur de votre navigateur. Le surlignage n'y est pas possible : notez vos citations à la main, elles seront gardées avec l'article."
              : "Ouvrez-le dans un nouvel onglet : le surlignage n'y sera pas possible, notez vos citations à la main, elles seront gardées avec l'article."}{" "}
            <a href={originalUrl} target="_blank" rel="noreferrer" className="text-accent-brand underline underline-offset-3">Ouvrir le PDF dans un nouvel onglet</a>
          </p>
        </div>
        {/* Repli embarqué seulement pour une adresse vérifiée (https, hôte public) : jamais l'adresse brute d'OpenAlex (SEC-16). */}
        {embedUrl && (
          <object data={embedUrl} type="application/pdf" className="h-[80dvh] w-full rounded-lg ring-1 ring-foreground/10" aria-label="PDF original">
            <div className="rounded-xl border border-dashed p-8 text-center">
              <p className="text-base text-muted-foreground">
                Votre navigateur n'affiche pas ce PDF ici. <a href={embedUrl} target="_blank" rel="noreferrer" className="text-accent-brand underline underline-offset-3">Ouvrez-le dans un nouvel onglet</a>.
              </p>
            </div>
          </object>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-5">
      {!doc && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2" role="status" aria-live="polite">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" aria-hidden /> Chargement du PDF…
              {progress && progress.loaded > 0 && (
                <span>{formatBytes(progress.loaded)}{progress.total > 0 && ` / ${formatBytes(progress.total)}`}</span>
              )}
            </p>
            {progress && progress.total > 0 && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary" aria-hidden>
                <div className="h-full rounded-full bg-accent-brand transition-[width] duration-300" style={{ width: `${Math.min(100, Math.round((progress.loaded / progress.total) * 100))}%` }} />
              </div>
            )}
            {progress && progress.total > 8 * 1024 * 1024 && (
              <p className="text-sm text-muted-foreground">
                Gros fichier : vous pouvez aussi <a href={originalUrl} target="_blank" rel="noreferrer" className="text-accent-brand underline underline-offset-3">ouvrir le PDF original</a> en attendant.
              </p>
            )}
          </div>
          <Skeleton className="aspect-[1/1.414] w-full rounded-lg" />
        </div>
      )}
      {doc && lib && width > 0 && (
        <>
          <p className="text-sm text-muted-foreground">{doc.numPages} page{doc.numPages > 1 ? "s" : ""} · sélectionnez un passage pour le surligner.</p>
          {Array.from({ length: doc.numPages }, (_, i) => (
            <PdfPage
              key={i + 1}
              doc={doc}
              lib={lib}
              pageNumber={i + 1}
              width={width}
              defaultAspect={defaultAspect}
              highlights={byPage.get(i + 1) ?? NO_HIGHLIGHTS}
            />
          ))}
        </>
      )}
      <SelectionButton rect={selection?.rect ?? null} onClick={() => void save()} busy={busy} />
    </div>
  );
}

interface PageProps {
  doc: PDFDocumentProxy;
  lib: PdfLib;
  pageNumber: number;
  width: number;
  /** Proportion (hauteur / largeur) supposée tant que la page n'a pas été rendue. */
  defaultAspect: number;
  highlights: Highlight[];
}

/**
 * Mémoïsée : une sélection dans le lecteur re-rend `PdfReader` à chaque défilement (position du bouton « Surligner ») ;
 * les pages, dont les props ne changent pas, ne suivent pas.
 */
const PdfPage = memo(function PdfPage({ doc, lib, pageNumber, width, defaultAspect, highlights }: PageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(defaultAspect);
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [failed, setFailed] = useState(false);

  // Rendu paresseux : une page se dessine quand elle approche de l'écran, et libère son canevas quand elle s'en éloigne.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          setVisible(e.isIntersecting);
          if (e.isIntersecting) continue;
          const canvas = canvasRef.current;
          if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
          }
          textRef.current?.replaceChildren();
          setRendered(false);
        }
      },
      { rootMargin: "1200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !width) return;
    let cancelled = false;
    let renderTask: RenderTask | null = null;
    let textLayer: InstanceType<PdfLib["TextLayer"]> | null = null;
    (async () => {
      const page = await doc.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const scale = width / base.width;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const textDiv = textRef.current;
      if (cancelled || !canvas || !textDiv) return;
      setAspect(base.height / base.width);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      renderTask = page.render({ canvas, canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      await renderTask.promise;
      if (cancelled) return;
      textDiv.replaceChildren();
      textDiv.style.setProperty("--scale-factor", String(scale));
      textDiv.style.width = `${viewport.width}px`;
      textDiv.style.height = `${viewport.height}px`;
      textLayer = new lib.TextLayer({ textContentSource: page.streamTextContent(), container: textDiv, viewport });
      await textLayer.render();
      if (cancelled) return;
      setRendered(true);
    })().catch((e: unknown) => {
      // Rendu annulé par un redimensionnement : le prochain effet reprend ; sinon on le dit au lieu d'une page blanche.
      if (cancelled) return;
      console.error("[lecteur PDF] page", pageNumber, e);
      setFailed(true);
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [visible, width, doc, lib, pageNumber]);

  useEffect(() => {
    if (rendered && textRef.current) markSpans(textRef.current, highlights.map((h) => h.text));
  }, [rendered, highlights]);

  return (
    <div ref={ref} data-page={pageNumber} className="pdf-page relative bg-white shadow-sm ring-1 ring-foreground/10" style={{ width, height: rendered ? undefined : width * aspect }}>
      <canvas ref={canvasRef} aria-label={`Page ${pageNumber}`} />
      <div ref={textRef} className="textLayer" />
      {!rendered && visible && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-neutral-500" aria-live="polite">
          {failed ? (
            <span className="flex items-center gap-2 px-4 text-center"><AlertTriangleIcon className="size-4 shrink-0" aria-hidden /> Cette page n'a pas pu être affichée.</span>
          ) : (
            <span className="flex items-center gap-2"><Loader2Icon className="size-4 animate-spin" aria-hidden /> Page {pageNumber}…</span>
          )}
        </div>
      )}
    </div>
  );
});
