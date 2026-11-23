import { useEffect, useId, useState, type ReactNode } from 'react';
import { Lock, MessagesSquare, NotebookPen, Plus, Trash2, Users } from 'lucide-react';
import type { LearningNote, MyLearningItem } from '../../lib/types';
import { arNumber } from '../../lib/learning';
import { markDirty } from '../../lib/unsaved';
import { NoteThread, repliesLabel } from './SharedNotes';

/** «فوائدي» one lesson may hold; the server enforces the same bound. */
const MAX_NOTES = 20;

export interface NoteActions {
  onAdd: (text: string, shared: boolean) => Promise<boolean>;
  onEdit: (noteId: string, change: { text?: string; shared?: boolean }) => Promise<boolean>;
  onDelete: (noteId: string) => Promise<boolean>;
}

/**
 * The textarea shared by a new فائدة and an edited one, with «شاركها مع
 * إخوانك». Saved only on «حفظ» (or Ctrl+Enter, or Ctrl+S via the page's
 * unsaved guard).
 */
function NoteForm({
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

/**
 * One فائدة: tap it to edit, delete it from the editor after a second word.
 * A shared one shows its discussion, folded until opened.
 */
function NoteRow({ note, index, actions }: { note: LearningNote; index: number; actions: NoteActions }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [talking, setTalking] = useState(false);
  const [count, setCount] = useState(note.replyCount);

  if (!editing) {
    return (
      <li className="rounded-xl border-s-2 border-accent bg-surface-2/60">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="block w-full rounded-xl px-3.5 pt-2.5 text-start transition hover:bg-surface-2"
          aria-label={`عدّل الفائدة ${arNumber.format(index + 1)}`}
        >
          <span className="block whitespace-pre-line text-[15px] leading-7 text-fg">{note.text}</span>
        </button>
        <div className="flex flex-wrap items-center gap-x-3 px-3.5 pb-1.5 text-xs text-muted">
          {note.shared ? (
            <>
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                مشاركة مع إخوانك
              </span>
              <button
                type="button"
                onClick={() => setTalking((t) => !t)}
                aria-expanded={talking}
                className="inline-flex min-h-9 items-center gap-1 font-display text-accent hover:text-accent-strong"
              >
                <MessagesSquare className="h-3.5 w-3.5" aria-hidden="true" />
                {talking ? 'طيّ النقاش' : repliesLabel(count)}
              </button>
            </>
          ) : (
            <span className="inline-flex min-h-9 items-center gap-1">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              خاصة بك
            </span>
          )}
        </div>
        {talking && note.shared && (
          <div className="px-3.5 pb-3">
            <NoteThread noteId={note.id} onCount={setCount} />
          </div>
        )}
      </li>
    );
  }
  const remove = async () => {
    setBusy(true);
    const ok = await actions.onDelete(note.id);
    setBusy(false);
    if (!ok) setConfirming(false);
  };
  return (
    <li>
      <NoteForm
        dirtyKey={`learning-note-${note.id}`}
        initial={note.text}
        initialShared={note.shared}
        onSave={async (text, shared) => {
          const change = { ...(text !== note.text && { text }), ...(shared !== note.shared && { shared }) };
          const ok = Object.keys(change).length ? await actions.onEdit(note.id, change) : true;
          if (ok) setEditing(false);
          return ok;
        }}
        onCancel={() => {
          setEditing(false);
          setConfirming(false);
        }}
        extra={
          confirming ? (
            <span className="ms-auto inline-flex items-center gap-1">
              <span className="text-sm text-fg-2">{note.replyCount ? 'تحذفها ونقاشها؟' : 'تحذفها؟'}</span>
              <button type="button" disabled={busy} onClick={() => void remove()} className="btn-danger !min-h-10 !px-4 !text-sm">
                احذف
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="ms-auto inline-flex min-h-10 items-center gap-1 px-2 text-sm text-muted hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              حذف
            </button>
          )
        }
      />
    </li>
  );
}

/**
 * «فوائدي»: what the member took from a lesson they finished or began, in
 * their own words — as many as they took, each its own note, kept to
 * themselves or shared with the brothers.
 */
export default function LessonNotes({ item, actions }: { item: MyLearningItem; actions: NoteActions }) {
  const [adding, setAdding] = useState(false);
  const notes = item.notes;
  const full = notes.length >= MAX_NOTES;

  return (
    <section className="mt-3" aria-label="فوائدي">
      {notes.length > 0 && (
        <>
          <p className="mb-1.5 flex items-center gap-1.5 font-display text-xs text-accent">
            <NotebookPen className="h-3.5 w-3.5" aria-hidden="true" />
            فوائدي
            {notes.length > 1 && <span className="text-muted">({arNumber.format(notes.length)})</span>}
          </p>
          <ul className="space-y-2">
            {notes.map((n, i) => (
              <NoteRow key={`${n.id}-${n.text}-${n.shared}`} note={n} index={i} actions={actions} />
            ))}
          </ul>
        </>
      )}
      {adding ? (
        <div className={notes.length ? 'mt-2' : ''}>
          <NoteForm
            dirtyKey={`learning-note-new-${item.id}`}
            initial=""
            initialShared
            onSave={async (text, shared) => {
              const ok = await actions.onAdd(text, shared);
              if (ok) setAdding(false);
              return ok;
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : full ? null : (
        <div className={notes.length ? 'mt-1' : ''}>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex min-h-10 items-center gap-1.5 font-display text-sm text-accent hover:text-accent-strong"
          >
            {notes.length ? <Plus className="h-4 w-4" aria-hidden="true" /> : <NotebookPen className="h-4 w-4" aria-hidden="true" />}
            {notes.length ? 'أضف فائدة أخرى' : 'اكتب فائدة خرجت بها'}
          </button>
        </div>
      )}
    </section>
  );
}
