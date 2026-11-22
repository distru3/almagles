import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Download, Minus, Plus, X } from 'lucide-react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { arNumber } from '../../lib/learning';
import Spinner from '../Spinner';

/**
 * pdf.js, loaded only when a book is opened (it's large). The legacy build
 * also runs on the older phones members read on.
 */
async function loadPdfJs() {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

const pageKey = (id: string) => `almagles_learning_page_${id}`;
function savedPage(id: string): number | null {
  try {
    const n = Number(localStorage.getItem(pageKey(id)));
    return n > 0 ? n : null;
  } catch {
    return null;
  }
}
function savePage(id: string, page: number) {
  try {
    localStorage.setItem(pageKey(id), String(page));
  } catch {
    /* private mode */
  }
}

const ZOOMS = [0.75, 1, 1.25, 1.5, 2];

/**
 * A lesson's PDF, read inside the site: full screen, one page at a time drawn
 * with pdf.js (phones that won't show a PDF in a page still can), opening at
 * the lesson's page — or where the member stopped last time. Pages turn as in
 * an Arabic book: the next one is to the left (button, ← key, swipe right).
 * `footer` carries «أتممت الدرس».
 */
export default function PdfReader({
  itemId,
  url,
  title,
  startPage,
  onClose,
  footer,
}: {
  itemId: string;
  url: string;
  title: string;
  startPage: number | null;
  onClose: () => void;
  footer?: ReactNode;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(() => savedPage(itemId) ?? startPage ?? 1);
  const [typed, setTyped] = useState('');
  const [zoom, setZoom] = useState(1);
  const [drawing, setDrawing] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const task = useRef<RenderTask | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Keep the page behind still while the book is open.
  useEffect(() => {
    const html = document.documentElement;
    const previous = html.style.overflow;
    html.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      html.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    let active = true;
    let loaded: PDFDocumentProxy | null = null;
    loadPdfJs()
      .then((pdfjs) => pdfjs.getDocument({ url, isEvalSupported: false }).promise)
      .then((d) => {
        loaded = d;
        if (!active) return void d.destroy();
        setDoc(d);
        setPage((p) => Math.min(Math.max(1, p), d.numPages));
      })
      .catch(() => active && setError(true));
    return () => {
      active = false;
      void loaded?.destroy();
    };
  }, [url]);

  const draw = useCallback(async () => {
    if (!doc || !canvas.current || !box.current) return;
    setDrawing(true);
    task.current?.cancel();
    try {
      const p = await doc.getPage(page);
      const base = p.getViewport({ scale: 1 });
      const width = Math.min(box.current.clientWidth, 900);
      const viewport = p.getViewport({ scale: (width / base.width) * zoom });
      const ratio = window.devicePixelRatio || 1;
      const c = canvas.current;
      c.width = Math.floor(viewport.width * ratio);
      c.height = Math.floor(viewport.height * ratio);
      c.style.width = `${Math.floor(viewport.width)}px`;
      c.style.height = `${Math.floor(viewport.height)}px`;
      const ctx = c.getContext('2d')!;
      const t = p.render({ canvasContext: ctx, viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined });
      task.current = t;
      await t.promise;
      setDrawing(false);
    } catch (err) {
      // A newer page asked for: this drawing was cancelled on purpose.
      if ((err as { name?: string })?.name !== 'RenderingCancelledException') setError(true);
    }
  }, [doc, page, zoom]);

  useEffect(() => {
    void draw();
    savePage(itemId, page);
    box.current?.scrollTo({ top: 0 });
  }, [draw, itemId, page]);

  useEffect(() => {
    const onResize = () => void draw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [draw]);

  const count = doc?.numPages ?? 0;
  const go = useCallback((n: number) => count && setPage(Math.min(Math.max(1, n), count)), [count]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft') go(page + 1);
      if (e.key === 'ArrowRight') go(page - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose, page]);

  const navButton = 'flex h-11 w-11 items-center justify-center rounded-full border border-line-strong text-fg transition hover:border-accent hover:text-accent disabled:opacity-40';

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex flex-col bg-canvas">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2 sm:px-5">
        <button ref={closeRef} type="button" onClick={onClose} aria-label="إغلاق الكتاب" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2">
          <X className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[16px] text-fg">{title}</p>
          {count > 0 && (
            <p className="text-xs text-muted">
              صفحة {arNumber.format(page)} من {arNumber.format(count)}
              {startPage && page !== startPage && (
                <button type="button" onClick={() => go(startPage)} className="ms-2 text-accent hover:text-accent-strong">
                  عُد إلى صفحة الدرس ({arNumber.format(startPage)})
                </button>
              )}
            </p>
          )}
        </div>
        <div className="hidden items-center gap-1 sm:flex">
          <button type="button" onClick={() => setZoom((z) => ZOOMS[Math.max(0, ZOOMS.indexOf(z) - 1)])} aria-label="تصغير" className="flex h-10 w-10 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2">
            <Minus className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(z) + 1)])} aria-label="تكبير" className="flex h-10 w-10 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer" aria-label="تنزيل الملف" title="تنزيل الملف" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2">
          <Download className="h-4 w-4" />
        </a>
      </header>

      <div
        ref={box}
        className="relative min-h-0 flex-1 overflow-auto overscroll-contain bg-surface-2/60 px-2 py-3 sm:px-4"
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={(e) => {
          const start = touch.current;
          touch.current = null;
          if (!start || zoom > 1) return;
          const dx = e.changedTouches[0].clientX - start.x;
          const dy = e.changedTouches[0].clientY - start.y;
          if (Math.abs(dx) < 70 || Math.abs(dy) > 50) return;
          go(dx > 0 ? page + 1 : page - 1);
        }}
      >
        {error ? (
          <div className="mx-auto mt-16 max-w-sm text-center">
            <p className="font-display text-lg text-fg">تعذّر فتح الملف هنا</p>
            <p className="mt-1 text-sm text-muted">جرّب فتحه في نافذة جديدة.</p>
            <a href={url} target="_blank" rel="noopener noreferrer" className="btn-outline mt-4">
              <Download className="h-4 w-4" aria-hidden="true" />
              فتح الملف
            </a>
          </div>
        ) : (
          <>
            {(!doc || drawing) && (
              <div className="absolute inset-x-0 top-16 flex justify-center">
                <Spinner />
              </div>
            )}
            <canvas ref={canvas} dir="ltr" className={`mx-auto block bg-white shadow-sm transition-opacity ${drawing ? 'opacity-40' : 'opacity-100'}`} />
          </>
        )}
      </div>

      <footer className="border-t border-line px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2.5 sm:px-5">
        {count > 0 && (
          <div className="flex items-center justify-center gap-2">
            <button type="button" onClick={() => go(page - 1)} disabled={page <= 1} aria-label="الصفحة السابقة" className={navButton}>
              <ChevronRight className="h-5 w-5" />
            </button>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const n = Number(typed);
                if (n > 0) go(n);
                setTyped('');
              }}
            >
              <label className="sr-only" htmlFor={`pdf-page-${itemId}`}>
                اذهب إلى صفحة
              </label>
              <input
                id={`pdf-page-${itemId}`}
                inputMode="numeric"
                className="input !h-11 !w-20 !py-0 text-center font-display"
                placeholder={arNumber.format(page)}
                value={typed}
                onChange={(e) => setTyped(e.target.value.replace(/[^\d٠-٩]/g, '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))))}
              />
            </form>
            <button type="button" onClick={() => go(page + 1)} disabled={page >= count} aria-label="الصفحة التالية" className={navButton}>
              <ChevronLeft className="h-5 w-5" />
            </button>
          </div>
        )}
        {footer && <div className="mt-2.5 flex justify-center">{footer}</div>}
      </footer>
    </div>
  );
}
