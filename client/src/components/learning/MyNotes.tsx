import { useEffect, useId, useState } from 'react';
import { NotebookPen, Plus, Search, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { NoteLesson, SharedNote } from '../../lib/types';
import { arNumber } from '../../lib/learning';
import { hijriShort } from '../../lib/dates';
import Spinner from '../Spinner';
import EmptyState from '../EmptyState';
import { SharedNoteCard } from './SharedNotes';
import NoteForm from './NoteForm';

/** «فوائدي» one lesson may hold; the server enforces the same bound. */
const MAX_NOTES = 20;

type Page = { notes: SharedNote[]; total: number; nextCursor: string | null };

const notesLabel = (n: number) => (n === 1 ? 'فائدة واحدة' : n === 2 ? 'فائدتان' : n <= 10 ? `${arNumber.format(n)} فوائد` : `${arNumber.format(n)} فائدة`);

/** How a lesson reads in the picker: its name, portion, day and how far the member got. */
const lessonOption = (l: NoteLesson) =>
  [`${l.title}${l.portion ? ` (${l.portion})` : ''}`, hijriShort(l.date), l.progress < 100 ? 'أنجزت بعضه' : null, l.noteCount >= MAX_NOTES ? 'اكتملت فوائده' : null]
    .filter(Boolean)
    .join(' · ');

/**
 * «أضف فائدة» from «فوائدي»: choose the lesson it belongs to — any the member
 * finished or began, the latest first — and write it. Saved on «حفظ» like
 * every فائدة; the lesson can be changed before then without losing the text.
 */
function NewNote({ onAdded, onCancel }: { onAdded: () => void; onCancel: () => void }) {
  const [lessons, setLessons] = useState<NoteLesson[] | null>(null);
  const [lessonId, setLessonId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const uid = useId();

  useEffect(() => {
    let active = true;
    api<{ lessons: NoteLesson[] }>('/learning/notes/lessons')
      .then((res) => {
        if (!active) return;
        setLessons(res.lessons);
        setLessonId(res.lessons.find((l) => l.noteCount < MAX_NOTES)?.id ?? '');
      })
      .catch((err) => active && setError(err instanceof ApiError ? err.message : 'تعذّر تحميل دروسك'));
    return () => {
      active = false;
    };
  }, []);

  const save = async (text: string, shared: boolean) => {
    if (!lessonId) return false;
    setError(null);
    try {
      await api(`/learning/items/${lessonId}/notes`, { method: 'POST', body: { text, shared } });
      onAdded();
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر حفظ الفائدة');
      return false;
    }
  };

  return (
    <section className="card p-4 sm:p-5" aria-label="فائدة جديدة">
      <h2 className="flex items-center gap-1.5 font-display text-base text-fg">
        <NotebookPen className="h-4 w-4 text-accent" aria-hidden="true" />
        فائدة جديدة
      </h2>
      {!lessons && !error && <Spinner />}
      {lessons && lessons.length === 0 && (
        <div className="mt-2">
          <p className="text-sm leading-7 text-fg-2">تُكتب الفائدة على درس أتممته أو أنجزت بعضه — ابدأ درسك في «رحلتي»، ثم عُد إليها هنا.</p>
          <button type="button" className="btn-outline mt-3 !min-h-10 !px-5 !text-sm" onClick={onCancel}>
            تراجع
          </button>
        </div>
      )}
      {lessons && lessons.length > 0 && (
        <>
          <label htmlFor={`note-lesson-${uid}`} className="label mt-3">
            من أيّ درس؟
          </label>
          <select id={`note-lesson-${uid}`} className="input" value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
            {!lessonId && <option value="">اختر الدرس</option>}
            {lessons.map((l) => (
              <option key={l.id} value={l.id} disabled={l.noteCount >= MAX_NOTES}>
                {lessonOption(l)}
              </option>
            ))}
          </select>
          <div className="mt-3">
            <NoteForm dirtyKey="learning-note-new-mine" initial="" initialShared onSave={save} onCancel={onCancel} />
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}

/**
 * «فوائدي»: every فائدة the member wrote, newest first, from every lesson —
 * whether the lesson is still ticked, long past, or gone from the calendar.
 * Each can be edited, shared or kept private, deleted, liked by the brothers
 * and discussed, right here — and a new one written, on the lesson chosen.
 */
export default function MyNotes() {
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState<Page | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  /** Bumped after «أضف فائدة», to fetch the list afresh with the new one on top. */
  const [version, setVersion] = useState(0);
  const uid = useId();

  // Look up once typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => setQ(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const url = (cursor: string | null) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (cursor) params.set('cursor', cursor);
    const s = params.toString();
    return `/learning/notes/mine${s ? `?${s}` : ''}`;
  };

  useEffect(() => {
    let active = true;
    setError(null);
    api<Page>(url(null))
      .then((res) => active && setPage(res))
      .catch((err) => active && setError(err instanceof ApiError ? err.message : 'تعذّر تحميل فوائدك'));
    return () => {
      active = false;
    };
  }, [q, version]);

  const more = async () => {
    if (!page?.nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await api<Page>(url(page.nextCursor));
      setPage((p) => (p ? { ...res, notes: [...p.notes, ...res.notes] } : res));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر التحميل');
    } finally {
      setLoadingMore(false);
    }
  };

  const drop = (id: string) => setPage((p) => (p ? { ...p, notes: p.notes.filter((n) => n.id !== id), total: p.total - 1 } : p));
  const replace = (note: SharedNote) => setPage((p) => (p ? { ...p, notes: p.notes.map((n) => (n.id === note.id ? note : n)) } : p));

  const added = () => {
    setAdding(false);
    setQuery('');
    setQ('');
    setVersion((v) => v + 1);
  };
  const composer = adding && <NewNote onAdded={added} onCancel={() => setAdding(false)} />;
  const addButton = !adding && (
    <button type="button" onClick={() => setAdding(true)} className="btn-primary !min-h-10 !px-5 !text-sm">
      <Plus className="h-4 w-4" aria-hidden="true" />
      أضف فائدة
    </button>
  );

  if (!page) return error ? <p className="text-sm text-danger">{error}</p> : <Spinner full />;
  if (!q && page.total === 0) {
    return (
      composer || (
        <EmptyState
          icon={NotebookPen}
          title="لم تكتب فائدة بعد"
          description="اكتب ما خرجت به من درس أتممته أو أنجزت بعضه — هنا، أو تحت الدرس في «رحلتي» — تجده محفوظًا، تعود إليه متى شئت."
          action={addButton}
        />
      )
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <label htmlFor={`notes-search-${uid}`} className="sr-only">
            ابحث في فوائدك
          </label>
          <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            id={`notes-search-${uid}`}
            type="search"
            className="input !rounded-full ps-10 pe-10"
            placeholder="ابحث في فوائدك أو باسم الدرس…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="مسح البحث"
              className="absolute end-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="font-display text-sm text-muted">{q ? `${notesLabel(page.total)} تطابق «${q}»` : notesLabel(page.total)}</p>
        {addButton && <div className="ms-auto">{addButton}</div>}
      </div>
      {composer}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {page.notes.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">لا فائدة تطابق «{q}».</p>
      ) : (
        page.notes.map((n) => <SharedNoteCard key={n.id} note={n} onHidden={drop} onChanged={replace} />)
      )}
      {page.nextCursor && (
        <div className="text-center">
          <button type="button" onClick={() => void more()} disabled={loadingMore} className="btn-outline !min-h-10 !text-sm">
            المزيد من فوائدي
          </button>
        </div>
      )}
    </div>
  );
}
