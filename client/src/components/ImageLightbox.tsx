import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { PostImage } from '../lib/types';
import { cloudinaryUrl } from '../lib/image';
import { arNumber } from './reactions';

/** How far a finger must travel sideways to change photo. */
const SWIPE_PX = 50;

/**
 * Full-screen photo viewer: arrows, keyboard, swipe, and a counter.
 * The site is right-to-left, so "next" sits on the left and ArrowLeft moves forward.
 */
export default function ImageLightbox({
  images,
  startIndex,
  alt,
  onClose,
}: {
  images: PostImage[];
  startIndex: number;
  alt: string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const count = images.length;
  const many = count > 1;

  const go = useCallback((delta: number) => setIndex((i) => (i + delta + count) % count), [count]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') go(1);
      else if (e.key === 'ArrowRight') go(-1);
    };
    const html = document.documentElement;
    const previous = html.style.overflow;
    html.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      html.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [go, onClose]);

  // Load the neighbours ahead of time, so swiping doesn't wait.
  useEffect(() => {
    if (!many) return;
    for (const d of [1, -1]) new Image().src = cloudinaryUrl(images[(index + d + count) % count].url, 1600);
  }, [index, images, count, many]);

  const image = images[index];
  const navButton =
    'absolute top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25 sm:flex';

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex select-none items-center justify-center bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label={many ? `الصورة ${arNumber.format(index + 1)} من ${arNumber.format(count)}` : 'الصورة مكبّرة'}
      onClick={onClose}
      onTouchStart={(e) => {
        const t = e.touches[0];
        touchStart.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchEnd={(e) => {
        const start = touchStart.current;
        touchStart.current = null;
        if (!start || !many) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - start.x;
        if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(t.clientY - start.y)) return;
        // Right-to-left: dragging the photo rightwards brings in the next one.
        go(dx > 0 ? 1 : -1);
      }}
    >
      <img
        key={image.id}
        src={cloudinaryUrl(image.url, 1600)}
        alt={many ? `${alt} (${index + 1})` : alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] max-w-[100vw] object-contain sm:max-w-[92vw]"
        draggable={false}
      />

      <button
        type="button"
        onClick={onClose}
        className="absolute top-3 left-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25"
        aria-label="إغلاق"
      >
        <X className="h-6 w-6" />
      </button>

      {many && (
        <>
          <span className="absolute top-5 right-4 rounded-full bg-white/10 px-3 py-1 font-display text-sm text-white" aria-hidden="true">
            {arNumber.format(index + 1)} / {arNumber.format(count)}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            className={`${navButton} right-4`}
            aria-label="الصورة السابقة"
          >
            <ChevronRight className="h-7 w-7" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            className={`${navButton} left-4`}
            aria-label="الصورة التالية"
          >
            <ChevronLeft className="h-7 w-7" />
          </button>
          <div className="absolute bottom-5 flex gap-1.5" aria-hidden="true">
            {images.map((img, i) => (
              <span key={img.id} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/40'}`} />
            ))}
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}
