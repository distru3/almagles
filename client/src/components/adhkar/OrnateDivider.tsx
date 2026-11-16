export default function OrnateDivider({ className = '' }: { className?: string }) {
  return (
    <div className={`my-8 flex items-center justify-center gap-3 text-accent ${className}`} aria-hidden="true">
      <div className="h-px flex-1 bg-gradient-to-l from-accent/50 via-line-strong to-transparent" />
      
      {/* Islamic illuminated manuscript motif */}
      <svg
        viewBox="0 0 160 28"
        className="h-6 w-36 shrink-0 fill-current opacity-80"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Left flourish */}
        <path d="M10 14 C25 14, 30 7, 45 14 C30 21, 25 14, 10 14 Z" opacity="0.6" />
        <circle cx="28" cy="14" r="2.5" />
        <path d="M48 14 L56 6 L64 14 L56 22 Z" />
        <circle cx="56" cy="14" r="1.5" className="fill-canvas" />

        {/* Center palmette / rosette */}
        <g transform="translate(80, 14)">
          {/* Central diamond */}
          <path d="M0 -11 L9 0 L0 11 L-9 0 Z" />
          <circle cx="0" cy="0" r="3" className="fill-canvas" />
          {/* Petals */}
          <circle cx="0" cy="-12" r="1.8" />
          <circle cx="0" cy="12" r="1.8" />
          <circle cx="-11" cy="0" r="1.8" />
          <circle cx="11" cy="0" r="1.8" />
        </g>

        {/* Right flourish */}
        <path d="M112 14 L104 6 L96 14 L104 22 Z" />
        <circle cx="104" cy="14" r="1.5" className="fill-canvas" />
        <circle cx="132" cy="14" r="2.5" />
        <path d="M150 14 C135 14, 130 7, 115 14 C130 21, 135 14, 150 14 Z" opacity="0.6" />
      </svg>

      <div className="h-px flex-1 bg-gradient-to-r from-accent/50 via-line-strong to-transparent" />
    </div>
  );
}
