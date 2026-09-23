"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { AlertTriangleIcon, ChevronDownIcon, Loader2Icon, Maximize2Icon, Minimize2Icon } from "lucide-react";
import { ArticleHighlights } from "@/components/highlights/article-highlights";
import { useHighlights } from "@/components/highlights/highlights-provider";
import { cleanSelectionText, readSelection, SelectionButton } from "@/components/highlights/selection-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Highlight } from "@/lib/highlights-shared";
import { cn } from "cn";

type PdfLib = typeof import("pdfjs-dist");

const GOTO_EVENT = "sextant:goto-page";
const NO_HIGHLIGHTS: Highlight[] = [];

function goToPage(page: number) {
  window.dispatchEvent(new CustomEvent(GOTO_EVENT, { detail: page }));
}

interface LayoutProps {
  url: string;
  originalUrl: string;
}

/**
 * Lecteur à gauche, « Mes surlignages » à droite (défilable) ; sur mobile, la liste se replie au-dessus du lecteur.
 * « Plein écran » passe le lecteur en plein écran (API du navigateur, ou repli fixe quand elle manque, iPhone par exemple).
 */
export function ReaderLayout({ url, originalUrl }: LayoutProps) {
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
        <PdfReader url={url} originalUrl={originalUrl} />
      </div>
    </div>
  );
}

function normalize(s: string) {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Marque les fragments de la couche texte couverts par un passage retenu (toutes les occurrences sur la page). */
function markSpans(container: HTMLElement, texts: string[]) {
  const spans = [...container.querySelectorAll<HTMLSpanElement>("span")].filter((s) => (s.textContent ?? "").trim() && !s.classList.contains("markedContent"));
  spans.forEach((s) => s.classList.remove("hl"));
  if (texts.length === 0) return;
  let full = "";
  const bounds: [number, number][] = [];
  for (const s of spans) {
    const t = normalize(s.textContent ?? "");
    if (full) full += " ";
    bounds.push([full.length, full.length + t.length]);
    full += t;
  }
  for (const raw of texts) {
    const t = normalize(raw);
    if (!t) continue;
    let idx = full.indexOf(t);
    while (idx >= 0) {
      const end = idx + t.length;
      spans.forEach((s, i) => {
        const [a, b] = bounds[i];
        if (a < end && b > idx) s.classList.add("hl");
      });
      idx = full.indexOf(t, end);
    }
  }
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
  return `${Math.max(1, Math.round(n / 1024))} Ko`;
}

function pageOf(node: Node | null | undefined): string | undefined {
  return (node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>("[data-page]")?.dataset.page;
}

interface ReaderProps {
  url: string;
  originalUrl: string;
}

/** Affiche le PDF page par page (PDF.js) avec une couche texte sélectionnable ; une sélection propose « Surligner ». */
export function PdfReader({ url, originalUrl }: ReaderProps) {
  const { highlights, add } = useHighlights();
  const [lib, setLib] = useState<PdfLib | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [width, setWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<(NonNullable<ReturnType<typeof readSelection>> & { page: number }) | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        // Ressources optionnelles de PDF.js servies depuis /public : décodeurs WebAssembly (JBIG2, JPX des scans anciens),
        // polices standard non embarquées, CMaps (CJK), profils ICC. Sans elles, les images sont ignorées et la page reste blanche.
        task = pdfjs.getDocument({
          url,
          wasmUrl: "/pdfjs/wasm/",
          iccUrl: "/pdfjs/iccs/",
          standardFontDataUrl: "/pdfjs/standard_fonts/",
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
        });
        task.onProgress = (p: { loaded: number; total?: number }) => {
          if (!cancelled) setProgress({ loaded: p.loaded, total: p.total ?? 0 });
        };
        const d = await task.promise;
        if (cancelled) {
          void task.destroy();
          return;
        }
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
      void task?.destroy();
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
      containerRef.current?.querySelector(`[data-page="${page}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener(GOTO_EVENT, onGoto);
    return () => window.removeEventListener(GOTO_EVENT, onGoto);
  }, []);

  /** Passages par page, avec une référence stable par page : la mise en surbrillance ne se rejoue qu'aux vrais changements. */
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
            Il s'affiche ci-dessous avec le lecteur de votre navigateur. Le surlignage n'y est pas possible : notez vos citations à la main, elles seront gardées avec l'article.{" "}
            <a href={originalUrl} target="_blank" rel="noreferrer" className="text-accent-brand underline underline-offset-3">Ouvrir le PDF dans un nouvel onglet</a>
          </p>
        </div>
        <object data={originalUrl} type="application/pdf" className="h-[80dvh] w-full rounded-lg ring-1 ring-foreground/10" aria-label="PDF original">
          <div className="rounded-xl border border-dashed p-8 text-center">
            <p className="text-base text-muted-foreground">
              Votre navigateur n'affiche pas ce PDF ici. <a href={originalUrl} target="_blank" rel="noreferrer" className="text-accent-brand underline underline-offset-3">Ouvrez-le dans un nouvel onglet</a>.
            </p>
          </div>
        </object>
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
            <PdfPage key={i + 1} doc={doc} lib={lib} pageNumber={i + 1} width={width} highlights={byPage.get(i + 1) ?? NO_HIGHLIGHTS} />
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
  highlights: Highlight[];
}

function PdfPage({ doc, lib, pageNumber, width, highlights }: PageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(1.414);
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
}
