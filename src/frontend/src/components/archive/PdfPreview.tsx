import type { ExternalBlob } from "@caffeineai/object-storage";
import { AlertTriangle, Download, Loader2 } from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";

/**
 * Maximum number of pages rendered into the preview. Documents longer than
 * this render their first `MAX_PREVIEW_PAGES` pages and surface a notice that
 * the full original can be downloaded, so a very large PDF can never lock up
 * the tab or exhaust memory.
 */
const MAX_PREVIEW_PAGES = 100;

/** Target rendered width for a page, in CSS pixels, before device scaling. */
const TARGET_PAGE_WIDTH = 760;

/** Upper bound on the device-pixel-ratio multiplier used for canvas backing. */
const MAX_PIXEL_RATIO = 2;

/** Message shown whenever the PDF cannot be rendered in-app. */
const PREVIEW_UNAVAILABLE_MESSAGE =
  "Preview unavailable. You can still download the original file.";

/**
 * How many animation frames to wait for a canvas that is expected to be
 * mounted but is not yet available. A canvas that never appears within this
 * budget fails the preview instead of being silently skipped.
 */
const MAX_CANVAS_WAIT_FRAMES = 60;

interface PdfPreviewProps {
  /** The stored original artifact; bytes are read from it, never mutated. */
  blob: ExternalBlob;
  /** Original filename, used for the download and the accessible label. */
  filename: string | undefined;
  /** Fallback label when no filename is stored. */
  title: string;
}

type PreviewStatus = "loading" | "rendering" | "ready" | "error";

/** Resolve on the next animation frame, or on a macrotask in non-DOM hosts. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * In-app PDF renderer built on PDF.js. Reads the PDF bytes from the existing
 * ExternalBlob and paints each page into its own canvas inside the shared
 * preview stage.
 *
 * The lifecycle is deliberately two-phase:
 *
 *   Phase 1 — LOAD DOCUMENT: read the bytes, create the PDF.js document, read
 *   the total page count, stash the document in a ref, and move the UI into
 *   its `rendering` state so React mounts one canvas per page.
 *
 *   Phase 2 — RENDER AFTER CANVASES EXIST: a second effect runs once the
 *   canvases are mounted, sizes each canvas from its page viewport, renders
 *   the page, and only then marks the preview `ready`. Canvases are never
 *   painted in the same render cycle that first creates them.
 *
 * Security posture: PDF.js parses and rasterizes the document itself, so no
 * embedded JavaScript runs, no HTML from the document is injected, and no
 * document navigation or form submission is possible. The bytes are handed to
 * PDF.js as a transferred ArrayBuffer and the loading task is destroyed on
 * unmount, so no large duplicate buffer is retained after rendering.
 */
export function PdfPreview({ blob, filename, title }: PdfPreviewProps) {
  const [status, setStatus] = useState<PreviewStatus>("loading");
  const [pageCount, setPageCount] = useState(0);
  const [renderedCount, setRenderedCount] = useState(0);
  const [isTruncated, setIsTruncated] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // One canvas per rendered page, in page order. The load effect clears this
  // whenever the document changes so stale refs are never reused.
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);

  // The document loaded in phase 1, consumed by the phase 2 render effect.
  const documentRef = useRef<PDFDocumentProxy | null>(null);

  // -------------------------------------------------------------------------
  // Phase 1 — load the document and mount the page canvases.
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;

    // Drop refs from any previous document before the new canvases mount.
    canvasRefs.current = [];
    documentRef.current = null;

    setStatus("loading");
    setPageCount(0);
    setRenderedCount(0);
    setIsTruncated(false);

    async function loadDocument() {
      try {
        const pdfjs = await import("pdfjs-dist");
        // The worker is bundled by Vite as a same-origin asset. PDF.js runs
        // parsing off the main thread; the worker is never given a remote URL.
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const bytes = await blob.getBytes();
        if (cancelled) return;

        // Copy into a standalone ArrayBuffer: PDF.js transfers ownership of
        // the buffer to the worker, so the blob's own bytes stay intact.
        const data = new Uint8Array(bytes).buffer;

        const task = pdfjs.getDocument({
          data,
          // Never render XFA forms.
          enableXfa: false,
          // The bytes are already in memory; no range/stream fetching needed.
          disableAutoFetch: true,
          disableStream: true,
        });
        loadingTask = task;

        const document = await task.promise;
        if (cancelled) return;

        const total = document.numPages;
        documentRef.current = document;
        setPageCount(total);
        setIsTruncated(total > MAX_PREVIEW_PAGES);
        // Hand off to phase 2: this transition mounts the page canvases.
        setStatus("rendering");
      } catch {
        if (cancelled) return;
        setStatus("error");
      }
    }

    void loadDocument();

    return () => {
      cancelled = true;
      documentRef.current = null;
      // Tear down the worker and any in-flight parse/render work.
      if (loadingTask) void loadingTask.destroy();
    };
  }, [blob]);

  // -------------------------------------------------------------------------
  // Phase 2 — render each page once its canvas is mounted.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (status !== "rendering") return;

    let cancelled = false;
    const loadedDocument = documentRef.current;
    if (!loadedDocument) {
      setStatus("error");
      return;
    }
    // Bind to a non-nullable const so the nested async closure keeps the
    // narrowed type.
    const pdfDocument: PDFDocumentProxy = loadedDocument;

    const toRender = Math.min(pdfDocument.numPages, MAX_PREVIEW_PAGES);
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);

    async function renderPages() {
      try {
        for (let pageNumber = 1; pageNumber <= toRender; pageNumber += 1) {
          if (cancelled) return;

          // Wait for React to mount this page's canvas. A canvas that never
          // appears is a real failure, never a silent skip.
          let canvas = canvasRefs.current[pageNumber - 1] ?? null;
          let waited = 0;
          while (!canvas && waited < MAX_CANVAS_WAIT_FRAMES) {
            await nextFrame();
            if (cancelled) return;
            canvas = canvasRefs.current[pageNumber - 1] ?? null;
            waited += 1;
          }
          if (!canvas) throw new Error("Canvas is unavailable");

          const page = await pdfDocument.getPage(pageNumber);
          if (cancelled) return;

          const baseViewport = page.getViewport({ scale: 1 });
          const scale = TARGET_PAGE_WIDTH / baseViewport.width;
          const viewport = page.getViewport({ scale });

          canvas.width = Math.floor(viewport.width * ratio);
          canvas.height = Math.floor(viewport.height * ratio);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;

          const context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas is unavailable");

          await page.render({
            canvas,
            canvasContext: context,
            viewport,
            transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
          }).promise;
          if (cancelled) return;

          setRenderedCount(pageNumber);
        }

        // Release per-page resources now that every canvas is painted.
        await pdfDocument.cleanup();
        if (cancelled) return;
        // Only now is the preview actually ready.
        setStatus("ready");
      } catch {
        if (cancelled) return;
        setStatus("error");
      }
    }

    void renderPages();

    return () => {
      cancelled = true;
    };
  }, [status]);

  async function handleDownload() {
    setIsDownloading(true);
    try {
      const bytes = await blob.getBytes();
      const url = URL.createObjectURL(new Blob([bytes]));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename || "document";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
    }
  }

  const downloadButton = (
    <button
      type="button"
      data-ocid="archive_detail.preview_download_button"
      onClick={() => void handleDownload()}
      disabled={isDownloading}
      className="preview-download"
    >
      <Download className="h-4 w-4" aria-hidden="true" />
      {isDownloading ? "Preparing download…" : "Download Original"}
    </button>
  );

  if (status === "error") {
    return (
      <div
        data-ocid="archive_detail.preview_error_state"
        className="preview-stage-frame"
      >
        <AlertTriangle
          className="h-10 w-10"
          strokeWidth={1.25}
          aria-hidden="true"
        />
        <p className="frame-title">Preview unavailable</p>
        <p className="frame-hint">{PREVIEW_UNAVAILABLE_MESSAGE}</p>
        {downloadButton}
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div
        data-ocid="archive_detail.preview_loading_state"
        className="preview-stage-frame"
      >
        <Loader2
          className="h-10 w-10 animate-spin"
          strokeWidth={1.25}
          aria-hidden="true"
        />
        <p className="frame-title">Preparing preview…</p>
        <p className="frame-hint">
          Rendering the original document in your browser.
        </p>
        {downloadButton}
      </div>
    );
  }

  return (
    <div className="pdf-preview">
      <section
        data-ocid="archive_detail.preview_pages"
        className="pdf-preview-pages"
        aria-label={`${filename || title} — ${pageCount} page${
          pageCount === 1 ? "" : "s"
        }`}
      >
        {Array.from({ length: pageCount }, (_, index) => index + 1)
          .slice(0, MAX_PREVIEW_PAGES)
          .map((pageNumber) => (
            <figure key={pageNumber} className="pdf-preview-page">
              <canvas
                ref={(element) => {
                  canvasRefs.current[pageNumber - 1] = element;
                }}
                aria-label={`Page ${pageNumber} of ${pageCount}`}
                className={
                  pageNumber <= renderedCount
                    ? "pdf-preview-canvas"
                    : "pdf-preview-canvas pdf-preview-canvas-pending"
                }
              />
              <figcaption className="pdf-preview-page-label">
                Page {pageNumber} of {pageCount}
              </figcaption>
            </figure>
          ))}
      </section>

      {isTruncated ? (
        <p
          data-ocid="archive_detail.preview_truncated_notice"
          className="pdf-preview-notice"
        >
          Showing the first {MAX_PREVIEW_PAGES} of {pageCount} pages. Download
          the original file to view the full document.
        </p>
      ) : null}

      <div className="pdf-preview-actions">{downloadButton}</div>
    </div>
  );
}
