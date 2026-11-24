import { useState } from 'react';
import { Heart, Lock, MessagesSquare, NotebookPen, Plus, Users } from 'lucide-react';
import type { LearningNote, MyLearningItem } from '../../lib/types';
import { arNumber } from '../../lib/learning';
import NoteForm, { DeleteNoteButton } from './NoteForm';
import { NoteThread, repliesLabel } from './SharedNotes';

/** «فوائدي» one lesson may hold; the server enforces the same bound. */
const MAX_NOTES = 20;

export interface NoteActions {
  onAdd: (text: string, shared: boolean) => Promise<boolean>;
  onEdit: (noteId: string, change: { text?: string; shared?: boolean }) => Promise<boolean>;
  onDelete: (noteId: string) => Promise<boolean>;
}

/**
 * One فائدة: tap it to edit, delete it from the editor after a second word.
 * A shared one shows its likes and its discussion, folded until opened.
 */
function NoteRow({ note, index, actions }: { note: LearningNote; index: number; actions: NoteActions }) {
  const [editing, setEditing] = useState(false);
  const [talking, setTalking] = useState(false);
  const [count, setCount] = useState(note.replyCount);

  if (editing) {
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
          onCancel={() => setEditing(false)}
          extra={<DeleteNoteButton replies={note.replyCount} onDelete={() => actions.onDelete(note.id)} />}
        />
      </li>
    );
  }
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
            {note.likeCount > 0 && (
              <span className="inline-flex items-center gap-1" title="أعجب بها إخوانك">
                <Heart className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                {arNumber.format(note.likeCount)}
              </span>
            )}
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

/**
 * «فوائدي»: what the member took from a lesson, in their own words — as many
 * as they took, each its own note, kept to themselves or shared with the
 * brothers. They stay even if the lesson is unticked; a new one waits for
 * the lesson to be finished or begun (`canAdd`).
 */
export default function LessonNotes({ item, actions, canAdd }: { item: MyLearningItem; actions: NoteActions; canAdd: boolean }) {
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
              <NoteRow key={`${n.id}-${n.updatedAt}-${n.shared}`} note={n} index={i} actions={actions} />
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
      ) : full || !canAdd ? null : (
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
