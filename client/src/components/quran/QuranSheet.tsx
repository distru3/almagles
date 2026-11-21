import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * A sheet over «المصحف» (the index, «علاماتي», an ayah's marks): slides up
 * from the bottom on phones, a centred panel on larger screens — the same
 * shape as ScheduleSheet. Escape or the backdrop closes it; focus returns to
 * what opened it.
 */
export default function QuranSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    const html = document.documentElement;
    const previous = html.style.overflow;
    html.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      html.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, []);

  return createPortal(
    <div
      className="sheet-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="sheet-panel flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-canvas shadow-2xl sm:max-w-lg sm:rounded-2xl">
        <div className="relative flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 pb-2.5 pt-3">
          <span className="absolute left-1/2 top-1.5 h-1.5 w-11 -translate-x-1/2 rounded-full bg-line-strong sm:hidden" aria-hidden="true" />
          <h2 className="font-display text-[17px] font-semibold">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-fg"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-3">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
