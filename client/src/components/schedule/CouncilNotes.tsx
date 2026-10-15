import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, NotebookPen } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { CouncilNote, ScheduleResponse } from '../../lib/types';
import { WEEKDAY_NAMES, weekdayKey, hijriShort, hijriDate, gregorianShort, todayISO } from '../../lib/dates';
import { weekDates, weekKeyOf, shiftWeek } from '../../lib/schedule';
import AyahText from '../AyahText';
import AyahButton from '../AyahButton';
import Spinner from '../Spinner';

const timeFormat = new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });

/** "آخر تعديل: فلان · ١٤ أكتوبر ٣:٢٠ م" */
function editedLine(note: CouncilNote): string {
  return `آخر تعديل${note.updatedByName ? `: ${note.updatedByName}` : ''} · ${timeFormat.format(new Date(note.updatedAt))}`;
}

/**
 * Editable «ملاحظات المجلس» for one day. Saves when focus leaves the box;
 * clearing it deletes the note.
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
  const box = useRef<HTMLTextAreaElement>(null);
  const id = `council-note-${date}`;

  useEffect(() => {
    latest.current = note?.content ?? '';
    setText(note?.content ?? '');
  }, [note]);

  const save = async () => {
    const content = latest.current.trim();
    if (content === (note?.content ?? '')) return;
    setState('saving');
    try {
      const res = await api<{ note: CouncilNote | null }>(`/schedule/notes/${date}`, { method: 'PUT', body: { content } });
      setState('idle');
      setError(null);
      onSaved(date, res.note);
    } catch (err) {
      setState('error');
      setError(err instanceof ApiError ? err.message : 'تعذّر حفظ الملاحظات');
    }
  };

  return (
    <div className="border-t border-line bg-surface-2/40 px-4 py-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={id} className="flex items-center gap-1.5 font-display text-sm text-accent">
          <NotebookPen className="h-4 w-4" aria-hidden="true" />
          ملاحظات المجلس
        </label>
        <AyahButton
          target={box}
          value={text}
          onChange={(next) => {
            latest.current = next;
            setText(next);
          }}
        />
      </div>
      <textarea
        id={id}
        ref={box}
        rows={Math.min(8, Math.max(2, text.split('\n').length + 1))}
        className="input resize-y !py-2 text-[15px] leading-[1.9]"
        placeholder="ما دار في مجلس هذا اليوم من فوائد وملاحظات…"
        value={text}
        maxLength={5000}
        onChange={(e) => {
          latest.current = e.target.value;
          setText(e.target.value);
        }}
        onBlur={save}
      />
      <p className={`mt-1 text-xs ${state === 'error' ? 'text-danger' : 'text-muted'}`} role="status">
        {state === 'saving' ? 'جارٍ الحفظ…' : state === 'error' ? error : note ? editedLine(note) : 'تُحفظ تلقائياً عند الخروج من الحقل'}
      </p>
    </div>
  );
}

/** Read-only display of a day's note, for the public schedule and today's lesson. */
export function CouncilNoteView({ note, compact = false }: { note: CouncilNote; compact?: boolean }) {
  return (
    <div className={`rounded-sm border-r-2 border-accent-fill bg-accent-soft/60 ${compact ? 'px-2.5 py-2' : 'px-3.5 py-2.5'}`}>
      <p className={`font-display text-accent ${compact ? 'text-[11px]' : 'text-sm'}`}>ملاحظات المجلس</p>
      <p className={`mt-0.5 whitespace-pre-line text-fg-2 ${compact ? 'text-[11px] leading-5' : 'text-[15px] leading-[1.9]'}`}>
        <AyahText text={note.content} />
      </p>
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
