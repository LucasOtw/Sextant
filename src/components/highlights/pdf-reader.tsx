"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { Loader2Icon } from "lucide-react";
import { ArticleHighlights } from "@/components/highlights/article-highlights";
import { useHighlights } from "@/components/highlights/highlights-provider";
import { readSelection, SelectionButton } from "@/components/highlights/selection-button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Highlight } from "@/lib/highlights-shared";

type PdfLib = typeof import("pdfjs-dist");

const GOTO_EVENT = "sextant:goto-page";

function goToPage(page: number) {
  window.dispatchEvent(new CustomEvent(GOTO_EVENT, { detail: page }));
}

interface LayoutProps {
  url: string;
  originalUrl: string;
}

/** Lecteur à gauche, « Mes surlignages » de l'article à droite (en dessous sur mobile). */
export function ReaderLayout({ url, originalUrl }: LayoutProps) {
  return (
    <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1"><PdfReader url={url} originalUrl={originalUrl} /></div>
      <aside className="w-full lg:sticky lg:top-20 lg:w-80 lg:shrink-0">
        <ArticleHighlights compact onGoToPage={goToPage} />
      </aside>
    </div>
  );
}

function normalize(s: string) {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Marque les fragments de la couche texte couverts par un passage retenu (recherche sur le texte concaténé de la page). */
function markSpans(container: HTMLElement, texts: string[]) {
  const spans = [...container.querySelectorAll<HTMLSpanElement>("span")].filter((s) => (s.textContent ?? "").trim() && !s.classList.contains("markedContent"));
  spans.forEach((s) => s.classList.remove("hl"));
  if (texts.length === 0) return;
  let full = "";
  const bounds: [number, number][] = [];
  for (const s of spans) {
    const t = normalize(s.textContent ?? "");
    const start = full.length;
    full += (full ? " " : "") + t;
    bounds.push([start + (full.length - t.length - start), full.length]);
  }
  for (const raw of texts) {
    const t = normalize(raw);
    if (!t) continue;
    const idx = full.indexOf(t);
    if (idx < 0) continue;
    const end = idx + t.length;
    spans.forEach((s, i) => {
      const [a, b] = bounds[i];
      if (a < end && b > idx) s.classList.add("hl");
    });
  }
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
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        task = pdfjs.getDocument({ url });
        const d = await task.promise;
        if (cancelled) return;
        setLib(pdfjs);
        setDoc(d);
      } catch {
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

  // Sélection dans une page → bouton flottant.
  useEffect(() => {
    const update = () => {
      const el = containerRef.current;
      if (!el) return;
      const read = readSelection(el);
      if (!read) return setSelection(null);
      const node = window.getSelection()?.anchorNode;
      const pageEl = (node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>("[data-page]");
      const page = Number(pageEl?.dataset.page);
      setSelection(page ? { ...read, page } : null);
    };
    document.addEventListener("selectionchange", update);
    window.addEventListener("scroll", update, { passive: true });
    return () => {
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
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <p className="text-lg font-medium">{error}</p>
        <p className="mt-1 text-base text-muted-foreground">
          Vous pouvez <a href={originalUrl} target="_blank" rel="noreferrer" className="text-accent-brand underline underline-offset-3">ouvrir le PDF original</a> et saisir vos citations à la main.
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-4">
      {!doc && (
        <div className="flex flex-col gap-4">
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2Icon className="size-4 animate-spin" aria-hidden /> Chargement du PDF…</p>
          <Skeleton className="aspect-[1/1.414] w-full rounded-lg" />
        </div>
      )}
      {doc && lib && width > 0 && (
        <>
          <p className="text-sm text-muted-foreground">{doc.numPages} page{doc.numPages > 1 ? "s" : ""} · sélectionnez un passage pour le surligner.</p>
          {Array.from({ length: doc.numPages }, (_, i) => (
            <PdfPage key={i + 1} doc={doc} lib={lib} pageNumber={i + 1} width={width} highlights={highlights.filter((h) => h.source === "pdf" && h.page === i + 1)} />
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

  // Rendu paresseux : une page se dessine quand elle approche de l'écran.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "900px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !width) return;
    let cancelled = false;
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
      await page.render({ canvas, canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined }).promise;
      if (cancelled) return;
      textDiv.replaceChildren();
      textDiv.style.setProperty("--scale-factor", String(scale));
      textDiv.style.width = `${viewport.width}px`;
      textDiv.style.height = `${viewport.height}px`;
      await new lib.TextLayer({ textContentSource: page.streamTextContent(), container: textDiv, viewport }).render();
      if (cancelled) return;
      setRendered(true);
    })().catch((e: unknown) => console.error("[lecteur PDF] page", pageNumber, e));
    return () => {
      cancelled = true;
    };
  }, [visible, width, doc, lib, pageNumber]);

  useEffect(() => {
    if (rendered && textRef.current) markSpans(textRef.current, highlights.map((h) => h.text));
  }, [rendered, highlights]);

  return (
    <div ref={ref} data-page={pageNumber} className="pdf-page relative bg-white shadow-sm ring-1 ring-foreground/10" style={{ width, height: rendered ? undefined : width * aspect }}>
      <canvas ref={canvasRef} aria-label={`Page ${pageNumber}`} />
      <div ref={textRef} className="textLayer" />
      <span className="pointer-events-none absolute -bottom-0 right-2 translate-y-full pt-0.5 text-xs text-muted-foreground" aria-hidden>{pageNumber}</span>
    </div>
  );
}
