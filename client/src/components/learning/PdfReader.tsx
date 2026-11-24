import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { BookCheck, Download, Maximize2, Minimize2, Minus, Plus, X } from 'lucide-react';
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
/** Gap between pages, and the breathing room left above a page we jump to. */
const GAP = 12;
/** Pages this far (in screens) above or below the view are drawn ahead; farther ones are cleared to spare a phone's memory. */
const AHEAD = '150% 0px';

type Size = [width: number, height: number];

/**
 * One page of the book. Its slot is always sized (so the scroll bar is true
 * before anything is drawn); the canvas is drawn only while the page is near
 * the view, and emptied once it's far away.
 */
function PdfPage({
  doc,
  n,
  width,
  size,
  near,
  onSize,
  slot,
}: {
  doc: PDFDocumentProxy;
  n: number;
  width: number;
  size: Size;
  near: boolean;
  onSize: (n: number, size: Size) => void;
  slot: (el: HTMLDivElement | null) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    if (!near) {
      c.width = 0;
      c.height = 0;
      setDrawn(false);
      return;
    }
    let cancelled = false;
    let task: RenderTask | null = null;
    (async () => {
      const p = await doc.getPage(n);
      if (cancelled) return;
      const base = p.getViewport({ scale: 1 });
      onSize(n, [base.width, base.height]);
      const viewport = p.getViewport({ scale: width / base.width });
      // Sharp on retina screens, but capped: a 3× canvas of a zoomed page is too heavy for a phone.
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.floor(viewport.width * ratio);
      c.height = Math.floor(viewport.height * ratio);
      task = p.render({ canvasContext: c.getContext('2d')!, viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined });
      await task.promise;
      if (!cancelled) setDrawn(true);
    })().catch(() => {
      // Cancelled because the page left the view or the zoom changed; it is redrawn when needed.
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, n, width, near, onSize]);

  return (
    <div ref={slot} data-page={n} className="relative shrink-0 bg-white shadow-sm" style={{ width, height: Math.round((width * size[1]) / size[0]) }}>
      <canvas ref={canvas} dir="ltr" className={`block h-full w-full transition-opacity duration-200 ${drawn ? 'opacity-100' : 'opacity-0'}`} />
    </div>
  );
}

/**
 * A lesson's PDF, read inside the site: every page one under the other, drawn
 * with pdf.js (phones that won't show a PDF in a page still can), opening at
 * the lesson's page — or where the member stopped last time.
 *
 * The book comes first: the only controls over it are a small floating row
 * (the page number, tap to jump; and `footer`, which carries «أتممت الدرس»)
 * that slips away while the member reads down and returns when they scroll
 * up or reach the end. «ملء الشاشة» hides the top bar and margins too.
 * The ← → keys still jump a page, as in an Arabic book (← is the next one).
 *
 * It opens where the member stopped on this device, else where they stopped
 * on another (`lastPage`, kept on the server), else at the lesson's page, and
 * hands back the page it was closed on so the lesson can offer «سجّل ما قرأت».
 *
 * «بلغت آخر الدرس»: once the member scrolls to the foot of the lesson's last
 * page (`endPage`), it asks — once per opening — whether they finished it,
 * with `endPrompt` (the lesson's «نعم، أتممته») beside «أكمل القراءة».
 */
export default function PdfReader({
  itemId,
  url,
  title,
  startPage,
  lastPage = null,
  endPage = null,
  onClose,
  footer,
  endPrompt,
}: {
  itemId: string;
  url: string;
  title: string;
  startPage: number | null;
  lastPage?: number | null;
  /** The lesson's last page: reaching its foot asks whether the lesson is done. */
  endPage?: number | null;
  onClose: (page: number) => void;
  footer?: ReactNode;
  /** The answer that finishes the lesson, shown when the end is reached. */
  endPrompt?: ReactNode;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(() => savedPage(itemId) ?? lastPage ?? startPage ?? 1);
  const [jumping, setJumping] = useState(false);
  const [typed, setTyped] = useState('');
  const [zoom, setZoom] = useState(1);
  const [full, setFull] = useState(false);
  const [barHidden, setBarHidden] = useState(false);
  const [boxWidth, setBoxWidth] = useState(0);
  const [sizes, setSizes] = useState<Record<number, Size>>({});
  const [near, setNear] = useState<Set<number>>(() => new Set());
  const box = useRef<HTMLDivElement>(null);
  const slots = useRef<(HTMLDivElement | null)[]>([]);
  const pageRef = useRef(page);
  pageRef.current = page;
  const closeRef = useRef<HTMLButtonElement>(null);
  // Asked at most once per opening, and not when the book opens already past the lesson's end.
  const [askEnd, setAskEnd] = useState(false);
  const askedRef = useRef(!endPage || !endPrompt || page > endPage);
  const endRef = useRef(endPage);
  endRef.current = endPage;
  const keepReadingRef = useRef<HTMLButtonElement>(null);

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
      .then(async (d) => {
        loaded = d;
        // The first page's shape stands in for every page until each is drawn.
        const first = (await d.getPage(1)).getViewport({ scale: 1 });
        if (!active) return void d.destroy();
        setSizes({ 1: [first.width, first.height] });
        setDoc(d);
        setPage((p) => Math.min(Math.max(1, p), d.numPages));
      })
      .catch(() => active && setError(true));
    return () => {
      active = false;
      void loaded?.destroy();
    };
  }, [url]);

  // The reading column: the box's inner width (at most 900px unless in «ملء الشاشة»), times the zoom.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const style = getComputedStyle(el);
      setBoxWidth(el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const width = Math.floor((full ? boxWidth : Math.min(boxWidth, 900)) * zoom);

  const count = doc?.numPages ?? 0;
  const ready = count > 0 && width > 0;

  const onSize = useCallback((n: number, size: Size) => {
    setSizes((s) => (s[n] && s[n][0] === size[0] && s[n][1] === size[1] ? s : { ...s, [n]: size }));
  }, []);

  // Which pages are near enough to draw.
  useEffect(() => {
    if (!ready || !box.current) return;
    const io = new IntersectionObserver(
      (entries) =>
        setNear((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            const n = Number((e.target as HTMLElement).dataset.page);
            if (e.isIntersecting) next.add(n);
            else next.delete(n);
          }
          return next;
        }),
      { root: box.current, rootMargin: AHEAD },
    );
    slots.current.slice(0, count).forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [count, ready]);

  const scrollToPage = useCallback((n: number) => {
    const el = slots.current[n - 1];
    if (el && box.current) box.current.scrollTop = el.offsetTop - GAP;
  }, []);

  // Open at the saved page, and stay on the same page when the zoom or the screen width changes.
  useLayoutEffect(() => {
    if (count && width > 0) scrollToPage(pageRef.current);
  }, [count, width, scrollToPage]);

  // While scrolling: the page counter follows the page under the upper third
  // of the screen, and the floating row steps aside on the way down.
  useEffect(() => {
    const el = box.current;
    if (!el || !count) return;
    let frame = 0;
    let last = el.scrollTop;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const top = el.scrollTop;
        const y = top + el.clientHeight / 3;
        let lo = 0;
        let hi = count - 1;
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2);
          if ((slots.current[mid]?.offsetTop ?? Infinity) <= y) lo = mid;
          else hi = mid - 1;
        }
        setPage(lo + 1);
        const endSlot = endRef.current ? slots.current[endRef.current - 1] : null;
        if (!askedRef.current && endSlot && endSlot.offsetTop + endSlot.offsetHeight <= top + el.clientHeight + GAP) {
          askedRef.current = true;
          setAskEnd(true);
        }
        const atEnd = top + el.clientHeight >= el.scrollHeight - 48;
        if (atEnd || top < last - 6) setBarHidden(false);
        else if (top > last + 6) setBarHidden(true);
        last = top;
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [count]);

  useEffect(() => {
    if (count) savePage(itemId, page);
  }, [count, itemId, page]);

  const go = useCallback(
    (n: number) => {
      if (!count) return;
      const target = Math.min(Math.max(1, n), count);
      setPage(target);
      scrollToPage(target);
    },
    [count, scrollToPage],
  );

  // «ملء الشاشة»: the browser's own full screen where the device allows it
  // (iPhones don't), and in every case no top bar and no margins.
  const enterFull = () => {
    setFull(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
  };
  const leaveFull = useCallback(() => {
    setFull(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, []);
  useEffect(() => {
    // Esc (or the phone's back gesture) leaves the browser's full screen on its own.
    const onChange = () => !document.fullscreenElement && setFull(false);
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (askEnd) return e.key === 'Escape' && setAskEnd(false);
      if (e.key === 'Escape') return full ? leaveFull() : onClose(page);
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft') go(page + 1);
      if (e.key === 'ArrowRight') go(page - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [askEnd, full, go, leaveFull, onClose, page]);

  useEffect(() => {
    if (askEnd) keepReadingRef.current?.focus();
  }, [askEnd]);

  const zoomBy = (step: number) => setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, ZOOMS.indexOf(z) + step))]);

  const barButton = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2 disabled:opacity-40';
  const pill = 'pointer-events-auto inline-flex h-11 items-center rounded-full border border-line bg-surface font-display text-sm text-fg shadow-xl';
  const fallback = sizes[1] ?? ([595, 842] as Size);

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex flex-col bg-canvas">
      {!full && (
        <header className="flex items-center gap-1 border-b border-line px-2 py-2 sm:gap-2 sm:px-5">
          <button ref={closeRef} type="button" onClick={() => onClose(page)} aria-label="إغلاق الكتاب" className={barButton}>
            <X className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[16px] text-fg">{title}</p>
            {count > 0 && startPage && page !== startPage && (
              <button type="button" onClick={() => go(startPage)} className="block truncate text-xs text-accent hover:text-accent-strong">
                عُد إلى صفحة الدرس ({arNumber.format(startPage)})
              </button>
            )}
          </div>
          <button type="button" onClick={() => zoomBy(-1)} disabled={zoom === ZOOMS[0]} aria-label="تصغير" className={barButton}>
            <Minus className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => zoomBy(1)} disabled={zoom === ZOOMS[ZOOMS.length - 1]} aria-label="تكبير" className={barButton}>
            <Plus className="h-4 w-4" />
          </button>
          <button type="button" onClick={enterFull} aria-label="ملء الشاشة" title="ملء الشاشة" className={barButton}>
            <Maximize2 className="h-4 w-4" />
          </button>
          <a href={url} target="_blank" rel="noopener noreferrer" aria-label="تنزيل الملف" title="تنزيل الملف" className={barButton}>
            <Download className="h-4 w-4" />
          </a>
        </header>
      )}

      <div ref={box} className={`relative min-h-0 flex-1 overflow-auto overscroll-contain bg-surface-2/60 pb-24 ${full ? 'px-0 pt-0' : 'px-2 pt-3 sm:px-4'}`}>
        {error ? (
          <div className="mx-auto mt-16 max-w-sm text-center">
            <p className="font-display text-lg text-fg">تعذّر فتح الملف هنا</p>
            <p className="mt-1 text-sm text-muted">جرّب فتحه في نافذة جديدة.</p>
            <a href={url} target="_blank" rel="noopener noreferrer" className="btn-outline mt-4">
              <Download className="h-4 w-4" aria-hidden="true" />
              فتح الملف
            </a>
          </div>
        ) : !doc || width <= 0 ? (
          <div className="flex justify-center pt-16">
            <Spinner />
          </div>
        ) : (
          <div className="flex w-max min-w-full flex-col items-center" style={{ gap: GAP }}>
            {Array.from({ length: count }, (_, i) => (
              <PdfPage
                key={i + 1}
                doc={doc}
                n={i + 1}
                width={width}
                size={sizes[i + 1] ?? fallback}
                near={near.has(i + 1)}
                onSize={onSize}
                slot={(el) => {
                  slots.current[i] = el;
                }}
              />
            ))}
          </div>
        )}
      </div>

      {full && (
        <button
          type="button"
          onClick={leaveFull}
          aria-label="الخروج من ملء الشاشة"
          title="الخروج من ملء الشاشة"
          className="absolute start-3 top-[max(0.75rem,env(safe-area-inset-top))] flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-fg-2 shadow-xl hover:text-accent"
        >
          <Minimize2 className="h-4 w-4" />
        </button>
      )}

      {count > 0 && (
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] transition duration-300 motion-reduce:transition-none ${
            barHidden && !jumping ? 'translate-y-full opacity-0' : 'translate-y-0 opacity-100'
          }`}
        >
          {jumping ? (
            <form
              className={`${pill} gap-2 ps-4 pe-1.5`}
              onSubmit={(e) => {
                e.preventDefault();
                const n = Number(typed);
                if (n > 0) go(n);
                setTyped('');
                setJumping(false);
              }}
            >
              <label htmlFor={`pdf-page-${itemId}`} className="text-muted">
                إلى صفحة
              </label>
              <input
                id={`pdf-page-${itemId}`}
                autoFocus
                inputMode="numeric"
                enterKeyHint="go"
                className="h-8 w-16 rounded-full border border-line-strong bg-canvas text-center text-fg outline-none focus:border-accent"
                placeholder={arNumber.format(page)}
                value={typed}
                onBlur={() => !typed && setJumping(false)}
                onChange={(e) => setTyped(e.target.value.replace(/[^\d٠-٩]/g, '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))))}
              />
            </form>
          ) : (
            <button type="button" onClick={() => setJumping(true)} aria-label="اذهب إلى صفحة" className={`${pill} px-4 hover:border-accent`}>
              {arNumber.format(page)}
              <span className="mx-1.5 text-muted">/</span>
              <span className="text-muted">{arNumber.format(count)}</span>
            </button>
          )}
          {footer && <div className="pointer-events-auto">{footer}</div>}
        </div>
      )}

      {askEnd && endPage && (
        <div
          className="sheet-backdrop absolute inset-0 z-10 flex items-end justify-center bg-black/55 sm:items-center sm:p-6"
          onClick={(e) => e.target === e.currentTarget && setAskEnd(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`pdf-end-${itemId}`}
            className="sheet-panel w-full rounded-t-2xl border border-line bg-canvas px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 text-center shadow-2xl sm:max-w-sm sm:rounded-2xl sm:pb-5"
          >
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent" aria-hidden="true">
              <BookCheck className="h-6 w-6" />
            </span>
            <p id={`pdf-end-${itemId}`} className="mt-3 font-display text-lg text-fg">
              بلغت آخر الدرس
            </p>
            <p className="mt-1 text-[15px] leading-7 text-fg-2">
              هذه صفحة {arNumber.format(endPage)}، آخر صفحات الدرس. هل أتممت قراءته؟
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {endPrompt}
              <button ref={keepReadingRef} type="button" onClick={() => setAskEnd(false)} className="btn-outline">
                لا، أكمل القراءة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
