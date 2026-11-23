import { useCallback, useEffect, useId, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { EyeOff, MessagesSquare, Send, Trash2, Users } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { NoteReply, SharedNote } from '../../lib/types';
import { dateTime, dateTimeTitle } from '../../lib/dates';
import { KINDS, arNumber } from '../../lib/learning';
import { markDirty } from '../../lib/unsaved';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../Avatar';
import RichText from '../RichText';
import Spinner from '../Spinner';
import EmptyState from '../EmptyState';

/** «٣ ردود» with Arabic number agreement. */
export function repliesLabel(n: number): string {
  if (n === 0) return 'لا ردود بعد';
  if (n === 1) return 'ردّ واحد';
  if (n === 2) return 'ردّان';
  if (n <= 10) return `${arNumber.format(n)} ردود`;
  return `${arNumber.format(n)} ردًّا`;
}

/** Admins and the journey's supervisors keep the discussion clean (the server checks the same). */
function useModerator() {
  const { user } = useAuth();
  return { user, moderator: user?.role === 'admin' || (user?.canManageSchedule ?? false) };
}

function Byline({ person, at }: { person: { id: string; name: string; avatarUrl: string | null }; at: string }) {
  const { user } = useAuth();
  return (
    <div className="flex items-center gap-2">
      <Link to={`/u/${person.id}`} tabIndex={-1} aria-hidden="true" className="shrink-0">
        <Avatar name={person.name} src={person.avatarUrl} size="xs" />
      </Link>
      <Link to={`/u/${person.id}`} className="font-display text-sm text-fg hover:text-accent">
        {person.id === user?.id ? 'أنت' : person.name}
      </Link>
      <time dateTime={at} title={dateTimeTitle(at)} className="text-xs text-muted">
        {dateTime(at)}
      </time>
    </div>
  );
}

/**
 * The discussion under a shared فائدة: the replies, oldest first, and a box
 * to add one. A reply is written and sent on «أرسل» (or Ctrl+Enter); its
 * writer, or a moderator, may delete it.
 */
export function NoteThread({ noteId, onCount }: { noteId: string; onCount?: (n: number) => void }) {
  const { user, moderator } = useModerator();
  const [replies, setReplies] = useState<NoteReply[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uid = useId();

  useEffect(() => {
    let active = true;
    api<{ replies: NoteReply[] }>(`/learning/notes/${noteId}`)
      .then((res) => active && setReplies(res.replies))
      .catch((err) => active && setError(err instanceof ApiError ? err.message : 'تعذّر تحميل النقاش'));
    return () => {
      active = false;
    };
  }, [noteId]);

  const send = async () => {
    if (!text.trim() || busy) return false;
    setBusy(true);
    setError(null);
    try {
      const { reply } = await api<{ reply: NoteReply }>(`/learning/notes/${noteId}/replies`, { method: 'POST', body: { text: text.trim() } });
      const next = [...(replies ?? []), reply];
      setReplies(next);
      onCount?.(next.length);
      setText('');
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر إرسال الردّ');
      return false;
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const key = `learning-reply-${noteId}`;
    markDirty(key, text.trim() ? { save: send } : null);
    return () => markDirty(key, null);
  });

  const remove = async (id: string) => {
    try {
      await api(`/learning/notes/${noteId}/replies/${id}`, { method: 'DELETE' });
      const next = (replies ?? []).filter((r) => r.id !== id);
      setReplies(next);
      onCount?.(next.length);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر حذف الردّ');
    } finally {
      setConfirming(null);
    }
  };

  return (
    <div className="mt-3 border-t border-line pt-3">
      {replies === null && !error && <Spinner />}
      {replies && replies.length > 0 && (
        <ul className="space-y-3">
          {replies.map((r) => (
            <li key={r.id} className="border-s-2 border-line ps-3">
              <div className="flex items-center justify-between gap-2">
                <Byline person={r.author} at={r.createdAt} />
                {(r.author.id === user?.id || moderator) &&
                  (confirming === r.id ? (
                    <span className="inline-flex items-center gap-1">
                      <button type="button" onClick={() => void remove(r.id)} className="min-h-9 rounded-full px-3 font-display text-xs text-danger hover:bg-danger-soft">
                        احذف
                      </button>
                      <button type="button" onClick={() => setConfirming(null)} className="min-h-9 rounded-full px-3 text-xs text-muted hover:text-fg">
                        تراجع
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(r.id)}
                      aria-label="حذف الردّ"
                      className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ))}
              </div>
              <p className="mt-1 whitespace-pre-line text-[15px] leading-8 text-fg-2">
                <RichText text={r.text} ugc />
              </p>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label htmlFor={`reply-${uid}`} className="sr-only">
          ردّك
        </label>
        <textarea
          id={`reply-${uid}`}
          className="input min-h-11 flex-1 leading-7"
          rows={1}
          value={text}
          maxLength={1000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={replies?.length ? 'شارك في النقاش…' : 'كن أول من يعلّق: زيادة، أو سؤال، أو دعاء لأخيك…'}
        />
        <button type="submit" disabled={busy || !text.trim()} className="btn-primary !min-h-11 !px-4" aria-label="أرسل الردّ">
          <Send className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}

/**
 * A فائدة a brother shared: who, from which lesson, what he wrote, and the
 * discussion under it, folded until opened.
 */
export function SharedNoteCard({
  note,
  showLesson = true,
  open: startOpen = false,
  highlight = false,
  onHidden,
}: {
  note: SharedNote;
  showLesson?: boolean;
  open?: boolean;
  highlight?: boolean;
  onHidden?: (id: string) => void;
}) {
  const { moderator } = useModerator();
  const [open, setOpen] = useState(startOpen);
  const [count, setCount] = useState(note.replyCount);
  const [hiding, setHiding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const Icon = KINDS[note.lesson.kind].icon;

  const hide = async () => {
    try {
      await api(`/learning/notes/${note.id}/unshare`, { method: 'POST' });
      onHidden?.(note.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر الإخفاء');
      setHiding(false);
    }
  };

  return (
    <article id={`note-${note.id}`} className={`card p-4 sm:p-5 ${highlight ? '!border-accent/60' : ''}`}>
      <Byline person={note.author} at={note.createdAt} />
      {showLesson && (
        <p className="mt-2 flex items-start gap-1.5 text-sm text-fg-2">
          <Icon className="mt-1 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
          <span>
            من درس «{note.lesson.title}»{note.lesson.portion && <span className="text-accent"> ({note.lesson.portion})</span>}
          </span>
        </p>
      )}
      <p className="mt-2 whitespace-pre-line border-s-2 border-accent ps-3 text-[16px] leading-8 text-fg">
        <RichText text={note.text} ugc />
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex min-h-10 items-center gap-1.5 font-display text-sm text-accent hover:text-accent-strong"
        >
          <MessagesSquare className="h-4 w-4" aria-hidden="true" />
          {open ? 'طيّ النقاش' : count ? repliesLabel(count) : 'علّق عليها'}
        </button>
        {moderator &&
          (hiding ? (
            <span className="ms-auto inline-flex items-center gap-1 text-xs">
              <span className="text-fg-2">تُخفى من «فوائد الإخوة» وتبقى لصاحبها؟</span>
              <button type="button" onClick={() => void hide()} className="min-h-9 rounded-full px-3 font-display text-danger hover:bg-danger-soft">
                أخفِها
              </button>
              <button type="button" onClick={() => setHiding(false)} className="min-h-9 rounded-full px-3 text-muted hover:text-fg">
                تراجع
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setHiding(true)} className="ms-auto inline-flex min-h-10 items-center gap-1 text-xs text-muted hover:text-danger">
              <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
              إخفاء
            </button>
          ))}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
      {open && <NoteThread noteId={note.id} onCount={setCount} />}
    </article>
  );
}

/**
 * «فوائد إخوانك» under a lesson: what the brothers shared from it, folded
 * behind a count so the card stays calm.
 */
export function LessonSharedNotes({ itemId, count }: { itemId: string; count: number }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<SharedNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || notes) return;
    let active = true;
    api<{ notes: SharedNote[] }>(`/learning/notes?itemId=${itemId}&limit=50`)
      .then((res) => active && setNotes(res.notes.filter((n) => n.author.id !== user?.id)))
      .catch((err) => active && setError(err instanceof ApiError ? err.message : 'تعذّر تحميل فوائد إخوانك'));
    return () => {
      active = false;
    };
  }, [open, notes, itemId, user?.id]);

  if (!count) return null;
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-surface-2 px-4 font-display text-sm text-fg-2 hover:text-accent"
      >
        <Users className="h-4 w-4 text-accent" aria-hidden="true" />
        فوائد إخوانك ({arNumber.format(count)})
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {error && <p className="text-sm text-danger">{error}</p>}
          {!notes && !error && <Spinner />}
          {notes?.map((n) => (
            <SharedNoteCard key={n.id} note={n} showLesson={false} onHidden={(id) => setNotes((ns) => ns?.filter((x) => x.id !== id) ?? null)} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * «فوائد الإخوة»: every فائدة shared from the journey, newest first, each
 * open to discussion. `?note=` (from a notification) brings one to the top
 * with its discussion open.
 */
export default function SharedNotesFeed() {
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get('note');
  const [notes, setNotes] = useState<SharedNote[] | null>(null);
  const [focus, setFocus] = useState<SharedNote | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(async (after: string | null) => {
    const res = await api<{ notes: SharedNote[]; nextCursor: string | null }>(`/learning/notes${after ? `?cursor=${after}` : ''}`);
    return res;
  }, []);

  useEffect(() => {
    let active = true;
    fetchPage(null)
      .then((res) => {
        if (!active) return;
        setNotes(res.notes);
        setCursor(res.nextCursor);
      })
      .catch((err) => active && setError(err instanceof ApiError ? err.message : 'تعذّر تحميل فوائد الإخوة'));
    return () => {
      active = false;
    };
  }, [fetchPage]);

  useEffect(() => {
    if (!focusId) return setFocus(null);
    let active = true;
    api<{ note: SharedNote }>(`/learning/notes/${focusId}`)
      .then((res) => active && setFocus(res.note))
      .catch((err) => active && setError(err instanceof ApiError ? err.message : 'تعذّر فتح الفائدة'));
    return () => {
      active = false;
    };
  }, [focusId]);

  const more = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await fetchPage(cursor);
      setNotes((ns) => [...(ns ?? []), ...res.notes]);
      setCursor(res.nextCursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر التحميل');
    } finally {
      setLoadingMore(false);
    }
  };

  const drop = (id: string) => {
    setNotes((ns) => ns?.filter((n) => n.id !== id) ?? null);
    if (focus?.id === id) setFocus(null);
  };

  if (!notes) return error ? <p className="text-sm text-danger">{error}</p> : <Spinner full />;
  const rest = focus ? notes.filter((n) => n.id !== focus.id) : notes;
  if (!focus && rest.length === 0) {
    return <EmptyState icon={MessagesSquare} title="لم يشارك أحد فائدة بعد" description="اكتب فائدة من درسك في «رحلتي» واختر «شاركها مع إخوانك»، ليتدارسها الإخوة معك." />;
  }
  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {focus && <SharedNoteCard key={`focus-${focus.id}`} note={focus} open highlight onHidden={drop} />}
      {rest.map((n) => (
        <SharedNoteCard key={n.id} note={n} onHidden={drop} />
      ))}
      {cursor && (
        <div className="text-center">
          <button type="button" onClick={() => void more()} disabled={loadingMore} className="btn-outline !min-h-10 !text-sm">
            المزيد من الفوائد
          </button>
        </div>
      )}
    </div>
  );
}
