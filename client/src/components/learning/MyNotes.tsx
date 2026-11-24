import { useEffect, useId, useState } from 'react';
import { NotebookPen, Search, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { SharedNote } from '../../lib/types';
import { arNumber } from '../../lib/learning';
import Spinner from '../Spinner';
import EmptyState from '../EmptyState';
import { SharedNoteCard } from './SharedNotes';

type Page = { notes: SharedNote[]; total: number; nextCursor: string | null };

const notesLabel = (n: number) => (n === 1 ? 'فائدة واحدة' : n === 2 ? 'فائدتان' : n <= 10 ? `${arNumber.format(n)} فوائد` : `${arNumber.format(n)} فائدة`);

/**
 * «فوائدي»: every فائدة the member wrote, newest first, from every lesson —
 * whether the lesson is still ticked, long past, or gone from the calendar.
 * Each can be edited, shared or kept private, deleted, liked by the brothers
 * and discussed, right here.
 */
export default function MyNotes() {
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState<Page | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  }, [q]);

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

  if (!page) return error ? <p className="text-sm text-danger">{error}</p> : <Spinner full />;
  if (!q && page.total === 0) {
    return (
      <EmptyState
        icon={NotebookPen}
        title="لم تكتب فائدة بعد"
        description="إذا أتممت درسًا في «رحلتي» أو أنجزت بعضه، اكتب ما خرجت به — تجده هنا محفوظًا، تعود إليه متى شئت."
      />
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
      </div>

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
