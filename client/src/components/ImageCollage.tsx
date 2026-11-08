import { useState } from 'react';
import type { PostImage } from '../lib/types';
import { cloudinaryUrl } from '../lib/image';
import { arNumber } from './reactions';
import ImageLightbox from './ImageLightbox';

/** At most this many tiles; the last one says how many more there are. */
const TILES = 4;

/**
 * A post's photos as a feed-style collage (1 · 2 side by side · 1 tall + 2 ·
 * 2×2 with «+N»). Tapping a photo opens it full screen at that photo.
 */
export default function ImageCollage({
  images,
  alt,
  variant = 'card',
  className = '',
}: {
  images: PostImage[];
  alt: string;
  /** card: feed (cropped to a tidy height); page: the post itself (a single photo keeps its shape). */
  variant?: 'card' | 'page';
  className?: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  if (!images.length) return null;

  const shown = images.slice(0, TILES);
  const extra = images.length - shown.length;
  const width = variant === 'page' ? 1100 : 1000;

  const tile = (img: PostImage, i: number, extraClass = '') => (
    <button
      key={img.id}
      type="button"
      onClick={() => setOpen(i)}
      className={`group relative block overflow-hidden bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${extraClass}`}
      aria-label={images.length > 1 ? `عرض الصورة ${arNumber.format(i + 1)} من ${arNumber.format(images.length)}` : 'تكبير الصورة'}
    >
      <img
        src={cloudinaryUrl(img.url, shown.length === 1 ? width : Math.round(width / 2))}
        alt={images.length > 1 ? `${alt} (${i + 1})` : alt}
        loading="lazy"
        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
      />
      {i === shown.length - 1 && extra > 0 && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/55 font-display text-3xl font-bold text-white">
          +{arNumber.format(extra)}
        </span>
      )}
    </button>
  );

  let body;
  if (shown.length === 1) {
    const img = shown[0];
    // Reserve the photo's real shape so the page doesn't jump while it loads.
    const ratio = img.width && img.height ? `${img.width} / ${img.height}` : undefined;
    body = (
      <button
        type="button"
        onClick={() => setOpen(0)}
        className="group relative block w-full overflow-hidden bg-surface-2"
        aria-label="تكبير الصورة"
      >
        <img
          src={cloudinaryUrl(img.url, width)}
          alt={alt}
          loading={variant === 'page' ? 'eager' : 'lazy'}
          style={{ aspectRatio: ratio }}
          className={variant === 'page' ? 'w-full object-contain' : 'max-h-[420px] w-full object-cover'}
        />
      </button>
    );
  } else if (shown.length === 2) {
    body = <div className="grid aspect-[2/1] grid-cols-2 gap-0.5">{shown.map((img, i) => tile(img, i))}</div>;
  } else if (shown.length === 3) {
    body = (
      <div className="grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-0.5">
        {tile(shown[0], 0, 'row-span-2')}
        {tile(shown[1], 1)}
        {tile(shown[2], 2)}
      </div>
    );
  } else {
    body = <div className="grid aspect-square grid-cols-2 grid-rows-2 gap-0.5 sm:aspect-[4/3]">{shown.map((img, i) => tile(img, i))}</div>;
  }

  return (
    <>
      <div className={className}>{body}</div>
      {open !== null && <ImageLightbox images={images} startIndex={open} alt={alt} onClose={() => setOpen(null)} />}
    </>
  );
}
