export default function Logo({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect width="48" height="48" rx="12" fill="#103f2d" />
      <path d="M17 8c-7 4.5-10 10-10 16 0 7.2 5.4 12 12 12 3.8 0 6.5-1.4 8-3.6 1.5 2.2 4.2 3.6 8 3.6 6.6 0 12-4.8 12-12 0-6-3-11.5-10-16-1.9 3-3 6.4-3 9.8C37 30 33 18 33 18h-6s0 12-3 12z" transform="translate(2 -1) scale(0.92)" fill="#eab308" />
      <path d="M12 30h24v2.5H12z" fill="#fdf3d4" />
      <text x="24" y="21" textAnchor="middle" fontSize="10" fontWeight="800" fill="#0c3b2c" fontFamily="Cairo, sans-serif">
        أمة
      </text>
    </svg>
  );
}