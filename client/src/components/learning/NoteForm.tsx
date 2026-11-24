import { useEffect, useId, useState, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { markDirty } from '../../lib/unsaved';

/**
 * The textarea for a new فائدة or an edited one, with «شاركها مع إخوانك».
 * Saved only on «حفظ» (or Ctrl+Enter, or Ctrl+S via the page's unsaved
 * guard). Used under a lesson, in «فوائدي» and on one's own card in «فوائد
 * الإخوة».
 */
export default function NoteForm({
  dirtyKey,
  initial,
  initialShared,
  onSave,
  onCancel,
  extra,
}: {
  dirtyKey: string;
  initial: string;
  initialShared: boolean;
  onSave: (text: string, shared: boolean) => Promise<boolean>;
  onCancel: () => void;
  extra?: ReactNode;
}) {
  const [text, setText] = useState(initial);
  const [shared, setShared] = useState(initialShared);
  const [busy, setBusy] = useState(false);
  const uid = useId();
  const dirty = text.trim() !== '' && (text.trim() !== initial.trim() || shared !== initialShared);

  const save = async () => {
    if (!text.trim()) return false;
    setBusy(true);
    const ok = await onSave(text.trim(), shared);
    setBusy(false);
    return ok;
  };

  useEffect(() => {
    markDirty(dirtyKey, dirty ? { save } : null);
    return () => markDirty(dirtyKey, null);
  });

  return (
    <form
      className="rounded-xl border border-line bg-surface-2/50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label htmlFor={`note-${uid}`} className="sr-only">
        الفائدة
      </label>
      <textarea
        id={`note-${uid}`}
        className="input min-h-24 leading-7"
        value={text}
        maxLength={1000}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void save();
          }
        }}
        placeholder="جملة تحفظها، أو معنى استوقفك، أو عمل تعزم عليه…"
        autoFocus
      />
      <label className="mt-2 flex min-h-10 cursor-pointer items-center gap-2.5 text-sm text-fg-2">
        <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={shared} onChange={(e) => setShared(e.target.checked)} />
        <span>
          <span className="font-display text-fg">شاركها مع إخوانك</span>
          <span className="text-muted"> — {shared ? 'تظهر في «فوائد الإخوة» ويعلّقون عليها' : 'تبقى لك وحدك'}</span>
        </span>
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="submit" className="btn-primary !min-h-10 !px-5 !text-sm" disabled={busy || !text.trim()}>
          حفظ
        </button>
        <button type="button" className="btn-outline !min-h-10 !px-5 !text-sm" onClick={onCancel}>
          تراجع
        </button>
        {extra}
      </div>
    </form>
  );
}

/** «حذف» with a second word before it goes; sits at the end of the editor's buttons. */
export function DeleteNoteButton({ replies, onDelete }: { replies: number; onDelete: () => Promise<boolean> }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="ms-auto inline-flex min-h-10 items-center gap-1 px-2 text-sm text-muted hover:text-danger">
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        حذف
      </button>
    );
  }
  return (
    <span className="ms-auto inline-flex items-center gap-1">
      <span className="text-sm text-fg-2">{replies ? 'تحذفها ونقاشها؟' : 'تحذفها؟'}</span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const ok = await onDelete();
          setBusy(false);
          if (!ok) setConfirming(false);
        }}
        className="btn-danger !min-h-10 !px-4 !text-sm"
      >
        احذف
      </button>
    </span>
  );
}
