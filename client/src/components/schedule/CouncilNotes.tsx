import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, List, ListOrdered, NotebookPen } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { CouncilNote, ScheduleResponse } from '../../lib/types';
import { WEEKDAY_NAMES, weekdayKey, hijriShort, hijriDate, gregorianShort, todayISO } from '../../lib/dates';
import { weekDates, weekKeyOf, shiftWeek } from '../../lib/schedule';
import { NOTE_MAX, continueList, toggleList } from '../../lib/noteFormat';
import AyahButton from '../AyahButton';
import NoteText from './NoteText';
import Spinner from '../Spinner';

const timeFormat = new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });

/** "آخر تعديل: فلان · ١٤ أكتوبر ٣:٢٠ م" */
function editedLine(note: CouncilNote): string {
  return `آخر تعديل${note.updatedByName ? `: ${note.updatedByName}` : ''} · ${timeFormat.format(new Date(note.updatedAt))}`;
}

/** Saves this long after the last keystroke, as well as on leaving the box. */
const AUTOSAVE_MS = 2500;

const toolButton =
  'inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line-strong px-3 font-display text-sm text-fg-2 transition hover:border-accent hover:text-accent';

/**
 * Editable «ملاحظات المجلس» for one day. Saves shortly after typing stops and
 * when focus leaves the box; clearing it deletes the note. The box grows with
 * the text, and Enter on a "- " / "1- " point starts the next one.
 */
export function CouncilNoteField({
  date,
  note,
  onSaved,
}: {
  date: string;
  note: CouncilNote | undefined;
  onSaved: (date: string, note: CouncilNote | null) => void;
}) {
  const [text, setText] = useState(note?.content ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  // Latest typed value, readable synchronously on blur (see SessionRow).
  const latest = useRef(text);
  // What the server holds, so only real changes are sent.
  const saved = useRef(note?.content ?? '');
  const inFlight = useRef(false);
  const queued = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const box = useRef<HTMLTextAreaElement>(null);
  const id = `council-note-${date}`;

  useEffect(() => {
    saved.current = note?.content ?? '';
    // Never replace text under the writer's cursor (an autosave landing mid-sentence).
    if (document.activeElement === box.current) return;
    latest.current = note?.content ?? '';
    setText(note?.content ?? '');
  }, [note]);

  const save = async () => {
    window.clearTimeout(timer.current);
    if (inFlight.current) {
      queued.current = true;
      return;
    }
    const content = latest.current.trim();
    if (content === saved.current) return;
    inFlight.current = true;
    setState('saving');
    try {
      const res = await api<{ note: CouncilNote | null }>(`/schedule/notes/${date}`, { method: 'PUT', body: { content } });
      saved.current = res.note?.content ?? '';
      setState('idle');
      setError(null);
      onSaved(date, res.note);
    } catch (err) {
      setState('error');
      setError(err instanceof ApiError ? err.message : 'تعذّر حفظ الملاحظات');
    } finally {
      inFlight.current = false;
      if (queued.current) {
        queued.current = false;
        void save();
      }
    }
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  // Flush on unmount (switching week or tab), and warn before closing the page with unsaved text.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (latest.current.trim() !== saved.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      if (latest.current.trim() !== saved.current) void saveRef.current();
    };
  }, []);

  const update = (next: string) => {
    latest.current = next;
    setText(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void saveRef.current(), AUTOSAVE_MS);
  };

  // Grow with the text up to most of the screen, then scroll inside.
  const fit = useCallback(() => {
    const el = box.current;
    if (!el) return;
    // Measuring at height:auto briefly shortens the page; keep the scroll position put.
    const y = window.scrollY;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, Math.max(240, window.innerHeight * 0.65))}px`;
    if (window.scrollY !== y) window.scrollTo({ top: y });
  }, []);
  useLayoutEffect(fit, [text, fit]);
  useEffect(() => {
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fit]);

  const setCaret = (start: number, end = start) =>
    requestAnimationFrame(() => {
      box.current?.focus();
      box.current?.setSelectionRange(start, end);
    });

  const applyList = (kind: 'bullet' | 'number') => {
    const el = box.current;
    if (!el) return;
    const r = toggleList(text, el.selectionStart, el.selectionEnd, kind);
    update(r.value);
    setCaret(r.start, r.end);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    const el = e.currentTarget;
    if (el.selectionStart !== el.selectionEnd) return;
    const r = continueList(text, el.selectionStart);
    if (!r) return;
    e.preventDefault();
    update(r.value);
    setCaret(r.caret);
  };

  return (
    <div className="border-t border-line bg-surface-2/40 px-4 py-3">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="flex items-center gap-1.5 font-display text-sm text-accent">
          <NotebookPen className="h-4 w-4" aria-hidden="true" />
          ملاحظات المجلس
        </label>
        <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="تنسيق الملاحظات" aria-controls={id}>
          <button
            type="button"
            className={toolButton}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyList('bullet')}
            title="تحويل الأسطر المحددة إلى نقاط"
          >
            <List className="h-4 w-4" aria-hidden="true" />
            نقاط
          </button>
          <button
            type="button"
            className={toolButton}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyList('number')}
            title="ترقيم الأسطر المحددة: 1- 2- 3-"
          >
            <ListOrdered className="h-4 w-4" aria-hidden="true" />
            ترقيم
          </button>
          <AyahButton target={box} value={text} onChange={update} />
        </div>
      </div>
      <textarea
        id={id}
        ref={box}
        rows={3}
        className="input resize-none overflow-y-auto !py-2 text-[15px] leading-[1.9]"
        placeholder={'ما دار في مجلس هذا اليوم من فوائد وملاحظات…\nابدأ السطر بـ «- » أو «1- » لكتابة نقاط'}
        value={text}
        maxLength={NOTE_MAX}
        onChange={(e) => update(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => void save()}
      />
      <div className="mt-1 flex items-start justify-between gap-3 text-xs">
        <p className={state === 'error' ? 'text-danger' : 'text-muted'} role="status">
          {state === 'saving' ? 'جارٍ الحفظ…' : state === 'error' ? error : note ? editedLine(note) : 'تُحفظ تلقائياً أثناء الكتابة'}
        </p>
        <span className={`shrink-0 tabular-nums ${text.length > NOTE_MAX * 0.9 ? 'text-danger' : 'text-muted'}`}>
          {text.length.toLocaleString('en')}/{NOTE_MAX.toLocaleString('en')}
        </span>
      </div>
    </div>
  );
}

/** Long content is cut to `maxRem` with a fade and a toggle to read it all. */
function Collapsible({ maxRem, compact, children }: { maxRem: number; compact: boolean; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const check = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      // Some slack, so a note just over the line isn't hidden behind a button.
      setOverflows(el.scrollHeight > maxRem * rem * 1.15);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxRem]);

  const collapsed = overflows && !open;
  const fade = 'linear-gradient(to bottom, #000 65%, transparent)';

  return (
    <div ref={outer}>
      <div style={collapsed ? { maxHeight: `${maxRem}rem`, overflow: 'hidden', maskImage: fade, WebkitMaskImage: fade } : undefined}>
        <div ref={inner}>{children}</div>
      </div>
      {overflows && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
            // Collapsing a long note: bring its start back on screen.
            if (open && outer.current && outer.current.getBoundingClientRect().top < 0) {
              outer.current.scrollIntoView({ block: 'start', behavior: 'smooth' });
            }
          }}
          className={`mt-1 inline-flex items-center gap-1 font-display text-accent hover:underline ${compact ? 'min-h-7 text-[11px]' : 'min-h-9 text-sm'}`}
        >
          {open ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
          {open ? 'عرض أقل' : 'عرض الملاحظات كاملة'}
        </button>
      )}
    </div>
  );
}

/** Read-only display of a day's note, for the public schedule and today's lesson. */
export function CouncilNoteView({ note, compact = false }: { note: CouncilNote; compact?: boolean }) {
  return (
    <div className={`rounded-sm border-r-2 border-accent-fill bg-accent-soft/60 ${compact ? 'px-2.5 py-2' : 'px-3.5 py-2.5'}`}>
      <p className={`font-display text-accent ${compact ? 'text-[11px]' : 'text-sm'}`}>ملاحظات المجلس</p>
      <div className={`mt-0.5 text-fg-2 ${compact ? 'text-[11px] leading-5' : 'text-[15px] leading-[1.9]'}`}>
        <Collapsible maxRem={compact ? 10 : 22} compact={compact}>
          <NoteText content={note.content} compact={compact} />
        </Collapsible>
      </div>
    </div>
  );
}

/** A week of note fields — for writers, who can write notes but not edit the schedule. */
export function CouncilNotesWeek() {
  const [week, setWeek] = useState(() => weekKeyOf(todayISO()));
  const [notes, setNotes] = useState<CouncilNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const days = weekDates(week);
  const [from, to] = [days[0], days[6]];
  const today = todayISO();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<ScheduleResponse>(`/schedule?from=${from}&to=${to}`);
      setNotes(res.notes);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'تعذّر التحميل');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const onSaved = (date: string, note: CouncilNote | null) =>
    setNotes((prev) => [...prev.filter((n) => n.date !== date), ...(note ? [note] : [])]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-[26px] font-semibold leading-tight">
            {hijriShort(days[0])} – {hijriDate(days[6])}
          </h2>
          <p className="text-sm text-muted">
            {gregorianShort(days[0])} – {gregorianShort(days[6])}
          </p>
        </div>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setWeek(shiftWeek(week, -1))} aria-label="الأسبوع السابق" className="flex h-11 w-11 items-center justify-center rounded-full border border-line-strong hover:border-accent hover:text-accent">
            <ChevronRight className="h-[18px] w-[18px]" />
          </button>
          <button type="button" onClick={() => setWeek(weekKeyOf(today))} disabled={week === weekKeyOf(today)} className="h-11 rounded-full border border-line-strong px-4 font-display text-sm hover:border-accent hover:text-accent disabled:opacity-50">
            اليوم
          </button>
          <button type="button" onClick={() => setWeek(shiftWeek(week, 1))} aria-label="الأسبوع التالي" className="flex h-11 w-11 items-center justify-center rounded-full border border-line-strong hover:border-accent hover:text-accent">
            <ChevronLeft className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : loadError ? (
        <p className="rounded border border-danger/40 bg-danger-soft px-4 py-3 text-danger">{loadError}</p>
      ) : (
        <div className="space-y-3">
          {days.map((iso) => (
            <section
              key={iso}
              aria-label={WEEKDAY_NAMES[weekdayKey(new Date(`${iso}T12:00:00`))]}
              className={`overflow-hidden rounded border bg-surface ${iso === today ? 'border-accent-fill border-t-[3px]' : 'border-line'}`}
            >
              <h3 className="px-4 py-2.5 font-display text-[17px] font-semibold">
                {WEEKDAY_NAMES[weekdayKey(new Date(`${iso}T12:00:00`))]}{' '}
                <span className="text-sm font-normal text-muted">
                  {hijriShort(iso)} · {gregorianShort(iso)}
                </span>
                {iso === today && <span className="text-sm text-accent"> · اليوم</span>}
              </h3>
              <CouncilNoteField date={iso} note={notes.find((n) => n.date === iso)} onSaved={onSaved} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
