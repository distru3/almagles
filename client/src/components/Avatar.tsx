import { useState } from 'react';
import { cloudinaryUrl } from '../lib/image';

const SIZES = {
  xs: 'h-7 w-7 text-xs',
  sm: 'h-8 w-8 text-sm',
  md: 'h-11 w-11 text-lg',
  lg: 'h-20 w-20 text-3xl',
  xl: 'h-28 w-28 text-5xl',
} as const;
const PIXELS = { xs: 56, sm: 64, md: 88, lg: 160, xl: 224 } as const;

/** A member's profile photo, or the first letter of their name when they have none (or it fails to load). */
export default function Avatar({
  name,
  src,
  size = 'md',
  className = '',
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const box = `${SIZES[size]} shrink-0 rounded-full`;
  if (src && !failed) {
    return (
      <img
        src={cloudinaryUrl(src, PIXELS[size])}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={`${box} border border-line-strong bg-surface-2 object-cover ${className}`}
      />
    );
  }
  return (
    <span
      className={`${box} flex items-center justify-center border border-line-strong bg-surface-2 font-display font-bold text-accent ${className}`}
      aria-hidden="true"
    >
      {name.trim().charAt(0) || '؟'}
    </span>
  );
}
