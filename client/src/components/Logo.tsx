/** Eight-point star mark, drawn in the current text colour. */
export default function Logo({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <rect x="14" y="14" width="20" height="20" />
      <rect x="14" y="14" width="20" height="20" transform="rotate(45 24 24)" />
      <circle cx="24" cy="24" r="3.2" />
    </svg>
  );
}

/** Tiled eight-point-star lattice used behind hero bands. Colour comes from the pattern token. */
export function StarPattern({ className = '' }: { className?: string }) {
  return (
    <svg className={`pointer-events-none absolute inset-0 h-full w-full text-pattern ${className}`} aria-hidden="true">
      <defs>
        <pattern id="almagles-star8" width="56" height="56" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="16" y="16" width="24" height="24" />
            <rect x="16" y="16" width="24" height="24" transform="rotate(45 28 28)" />
            <circle cx="28" cy="28" r="3" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#almagles-star8)" />
    </svg>
  );
}
