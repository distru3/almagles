import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { CouncilNote, ScheduleColumn, ScheduleItem } from '../lib/types';
import ScheduleTable from './ScheduleTable';

interface Props {
  items: ScheduleItem[];
  columns: ScheduleColumn[];
  notes: CouncilNote[];
  loading: boolean;
  onClose: () => void;
}

/**
 * The full weekly schedule as a sheet over the page, so it stays one tap away
 * however far down the endless feed the reader is. Slides up from the bottom on
 * phones, opens as a wide panel on larger screens.
 */
export default function ScheduleSheet({ items, columns, notes, loading, onClose }: Props) {
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
      className="sheet-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="المقرر الأسبوعي"
    >
      <div className="sheet-panel flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-canvas shadow-2xl sm:max-w-6xl sm:rounded-2xl">
        <div className="relative flex shrink-0 items-center justify-end px-3 pb-1 pt-2">
          {/* Grab handle: the phone-sheet cue that this slid up and can go back down. */}
          <span className="absolute left-1/2 top-2.5 h-1.5 w-11 -translate-x-1/2 rounded-full bg-line-strong sm:hidden" aria-hidden="true" />
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="إغلاق الجدول"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-fg"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div id="schedule" className="min-h-0 overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5 sm:pb-5">
          <ScheduleTable items={items} columns={columns} notes={notes} loading={loading} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
