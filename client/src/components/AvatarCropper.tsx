import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader as LoaderIcon, X, ZoomIn, ZoomOut } from 'lucide-react';

const VIEW = 280; // on-screen crop square, px
const OUT = 512; // saved photo, px
const MAX_ZOOM = 4;

interface Props {
  file: File;
  busy?: boolean;
  onCancel: () => void;
  onDone: (blob: Blob) => void;
}

/**
 * Square crop for a profile photo: drag to position, zoom with the slider,
 * the wheel or a pinch. The circle shows what others will see.
 */
export default function AvatarCropper({ file, busy = false, onCancel, onDone }: Props) {
  const [bitmap, setBitmap] = useState<ImageBitmap | HTMLImageElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Zoom and position change together; updates are computed from the latest
  // values so fast drags and pinches between renders never use stale ones.
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const { zoom } = view;
  const pos = { x: view.x, y: view.y };
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  // Decode once (createImageBitmap also reads iPhone HEIC in Safari).
  useEffect(() => {
    let cancelled = false;
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    (async () => {
      try {
        const bmp = 'createImageBitmap' in window ? await createImageBitmap(file) : await loadImage(objectUrl);
        if (!cancelled) setBitmap(bmp);
      } catch {
        if (!cancelled) setError('تعذّرت قراءة هذه الصورة — جرّب صورة JPG أو PNG');
      }
    })();
    return () => {
      cancelled = true;
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  const natural = bitmap ? { w: bitmap.width, h: bitmap.height } : null;
  const baseScale = natural ? VIEW / Math.min(natural.w, natural.h) : 1;
  const scale = baseScale * zoom;

  const clamp = useCallback(
    (p: { x: number; y: number }, s: number) => {
      if (!natural) return p;
      const W = natural.w * s;
      const H = natural.h * s;
      return { x: Math.min(0, Math.max(VIEW - W, p.x)), y: Math.min(0, Math.max(VIEW - H, p.y)) };
    },
    [natural],
  );

  // Start centred.
  useEffect(() => {
    if (!natural) return;
    setView({ zoom: 1, x: (VIEW - natural.w * baseScale) / 2, y: (VIEW - natural.h * baseScale) / 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bitmap]);

  /** Zoom around the centre of the crop square. */
  const zoomTo = (next: number | ((current: number) => number)) =>
    setView((v) => {
      const z = Math.min(MAX_ZOOM, Math.max(1, typeof next === 'function' ? next(v.zoom) : next));
      const s1 = baseScale * v.zoom;
      const s2 = baseScale * z;
      const cx = (VIEW / 2 - v.x) / s1;
      const cy = (VIEW / 2 - v.y) / s1;
      return { zoom: z, ...clamp({ x: VIEW / 2 - cx * s2, y: VIEW / 2 - cy * s2 }, s2) };
    });

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      zoomTo((pinch.current.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.dist);
      return;
    }
    // In RTL the box is still laid out left→right, so plain deltas are right.
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    setView((v) => ({ ...v, ...clamp({ x: v.x + dx, y: v.y + dy }, baseScale * v.zoom) }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const save = async () => {
    if (!bitmap) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingQuality = 'high';
    const size = VIEW / scale;
    ctx.drawImage(bitmap, -pos.x / scale, -pos.y / scale, size, size, 0, 0, OUT, OUT);
    const encode = (type: string) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.88));
    let blob = await encode('image/webp');
    if (!blob || blob.type !== 'image/webp') blob = await encode('image/jpeg');
    if (blob) onDone(blob);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="قص الصورة الشخصية">
      <div className="w-full max-w-sm rounded-t-2xl border border-line bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold">ضبط الصورة</h3>
          <button type="button" onClick={onCancel} className="flex h-10 w-10 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2" aria-label="إلغاء">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error ? (
          <p role="alert" className="rounded-xl border border-danger/50 bg-danger-soft px-3.5 py-3 text-sm text-danger">
            {error}
          </p>
        ) : (
          <>
            <div
              dir="ltr"
              className="relative mx-auto touch-none select-none overflow-hidden rounded-xl bg-black"
              style={{ width: VIEW, height: VIEW, cursor: 'grab' }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onWheel={(e) => zoomTo((z) => z * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}
            >
              {natural && url ? (
                <img
                  src={url}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute left-0 top-0 max-w-none"
                  style={{ width: natural.w * scale, height: natural.h * scale, transform: `translate(${pos.x}px, ${pos.y}px)` }}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-white/70">
                  <LoaderIcon className="h-6 w-6 animate-spin" />
                </div>
              )}
              {/* Everything outside the circle is dimmed. */}
              <div className="pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: '0 0 0 999px rgba(0,0,0,0.55)' }} />
              <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/80" />
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button type="button" onClick={() => zoomTo((z) => z / 1.25)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line-strong text-fg-2" aria-label="تصغير">
                <ZoomOut className="h-4 w-4" />
              </button>
              <input
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                onChange={(e) => zoomTo(Number(e.target.value))}
                className="w-full accent-[var(--accent-fill)]"
                aria-label="التكبير"
              />
              <button type="button" onClick={() => zoomTo((z) => z * 1.25)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line-strong text-fg-2" aria-label="تكبير">
                <ZoomIn className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-center text-xs text-muted">اسحب الصورة لضبط موضعها، وكبّرها بالمنزلق أو بإصبعين</p>
          </>
        )}

        <div className="mt-4 flex gap-2">
          <button type="button" onClick={save} disabled={!bitmap || busy} className="btn-primary flex-1">
            {busy && <LoaderIcon className="h-4 w-4 animate-spin" />}
            حفظ الصورة
          </button>
          <button type="button" onClick={onCancel} className="btn-outline">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
