import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, CalendarClock, Check, ExternalLink, ListChecks, Lock, Sparkles, Users, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { MyTask, MyTasks, TaskRepeat } from '../../lib/types';
import { todayISO } from '../../lib/dates';
import { isInternalPath, normalizeUrl } from '../../lib/url';
import { DAWAM, NO_WASTE, fadailFor, type Text } from '../../lib/fadail';
import { formatClock, loadPlace, type Place } from '../../lib/prayerTimes';
import { REPEAT_LABELS, nowHHMM, opensAt, scheduleSummary } from '../../lib/taskSchedule';
import Spinner from '../Spinner';
import FadlText from './FadlText';
import QiyamTimes from './QiyamTimes';

export { REPEAT_LABELS };

const arNumber = new Intl.NumberFormat('ar');

/** Section headings, in the order they're shown. */
const GROUPS: { repeat: TaskRepeat; title: string; hint: string }[] = [
  { repeat: 'daily', title: 'مهام اليوم', hint: 'تتجدد كل يوم' },
  { repeat: 'weekly', title: 'مهام الأسبوع', hint: 'تتجدد كل سبت' },
  { repeat: 'once', title: 'مهام مستمرة', hint: 'تُنجز مرة واحدة' },
];

/** "٥ أعضاء أنجزوها" with Arabic number agreement. */
function othersLabel(n: number): string {
  if (n === 1) return 'أنجزها عضو واحد';
  if (n === 2) return 'أنجزها عضوان';
  if (n >= 3 && n <= 10) return `أنجزها ${arNumber.format(n)} أعضاء`;
  return `أنجزها ${arNumber.format(n)} عضوًا`;
}

/** The good news shown after a tick: the task's own ayah or hadith, or a general one. */
function bushraFor(task: MyTask, seed: number): Text {
  const texts = fadailFor(`${task.title} ${task.description ?? ''}`).flatMap((f) => f.texts);
  const pool = texts.length ? texts : [NO_WASTE, DAWAM];
  return pool[seed % pool.length];
}

/**
 * The member's own checklist. Ticking saves at once (it's a single tap, not a
 * form) and rolls back with a message if the server refuses. Each tick earns
 * the task's points and shows a word of good news from the Qur'an or Sunnah.
 * `compact` is the home-page card: no grouping, a link to the full page.
 */
export default function TaskChecklist({ compact = false, onTicked }: { compact?: boolean; onTicked?: () => void }) {
  const [data, setData] = useState<MyTasks | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [openFadl, setOpenFadl] = useState<string | null>(null);
  const [bushra, setBushra] = useState<{ task: MyTask; text: Text; key: number } | null>(null);
  const [place, setPlace] = useState<Place>(loadPlace);
  const [, setTick] = useState(0);
  // When the list was loaded: reload when the page comes back after a while, or past midnight.
  const loaded = useRef({ date: todayISO(), at: Date.now() });
  const ticks = useRef(0);

  const load = useCallback(async () => {
    const date = todayISO();
    loaded.current = { date, at: Date.now() };
    try {
      setData(await api<MyTasks>(`/tasks?date=${date}&time=${nowHHMM()}`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر تحميل المهام');
    }
  }, []);

  useEffect(() => {
    void load();
    const onFocus = () => (loaded.current.date !== todayISO() || Date.now() - loaded.current.at > 10 * 60_000) && void load();
    window.addEventListener('focus', onFocus);
    // Re-render each minute so tasks unlock when their time comes.
    const timer = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(timer);
    };
  }, [load]);

  const patch = (id: string, change: (t: MyTask) => MyTask) =>
    setData((d) => (d ? { ...d, tasks: d.tasks.map((t) => (t.id === id ? change(t) : t)) } : d));

  const toggle = async (task: MyTask) => {
    if (pending.has(task.id)) return;
    const done = !task.done;
    const flip = (t: MyTask, to: boolean): MyTask => ({ ...t, done: to, doneCount: Math.max(0, t.doneCount + (to ? 1 : -1)) });
    setPending((p) => new Set(p).add(task.id));
    patch(task.id, (t) => flip(t, done));
    setError(null);
    if (done) {
      ticks.current += 1;
      setBushra({ task, text: bushraFor(task, ticks.current + new Date().getDate()), key: ticks.current });
    } else if (bushra?.task.id === task.id) {
      setBushra(null);
    }
    try {
      await api(`/tasks/${task.id}/done`, { method: 'PUT', body: { date: todayISO(), time: nowHHMM(), done } });
      onTicked?.();
    } catch (err) {
      patch(task.id, (t) => flip(t, !done));
      setBushra(null);
      setError(err instanceof ApiError ? err.message : 'تعذّر حفظ العلامة — حاول مرة أخرى');
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(task.id);
        return next;
      });
    }
  };

  const tasks = data?.tasks ?? null;
  const fadail = useMemo(() => new Map((tasks ?? []).map((t) => [t.id, fadailFor(`${t.title} ${t.description ?? ''}`)])), [tasks]);

  if (tasks === null) {
    return error ? (
      <p className="text-sm text-danger">{error}</p>
    ) : (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );
  }
  if (tasks.length === 0 && !data?.tomorrow.length) {
    return compact ? null : (
      <div className="rounded-sm border border-dashed border-line-strong px-5 py-10 text-center">
        <ListChecks className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
        <p className="mt-2 font-display text-lg">لا توجد مهام اليوم</p>
        <p className="mt-1 text-sm text-muted">ستظهر هنا المهام التي يضعها المشرفون.</p>
      </div>
    );
  }

  const doneCount = tasks.filter((t) => t.done).length;
  const allDone = tasks.length > 0 && doneCount === tasks.length;
  const earned = tasks.filter((t) => t.done).reduce((s, t) => s + t.points, 0);
  const possible = tasks.reduce((s, t) => s + t.points, 0);

  const row = (task: MyTask) => {
    const lockedUntil = task.done ? null : opensAt(task, place);
    const disabled = pending.has(task.id) || lockedUntil !== null;
    const entries = fadail.get(task.id) ?? [];
    const plain = task.timeWindow === 'anytime' && task.weekdays.length === 0 && !task.startDate && !task.endDate;
    return (
      <li key={task.id} className="py-3">
        <div className="flex items-start gap-3">
          <span className="relative mt-0.5">
            <button
              type="button"
              role="checkbox"
              aria-checked={task.done}
              aria-label={task.title}
              onClick={() => void toggle(task)}
              disabled={disabled}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 transition ${
                task.done
                  ? 'border-accent-fill bg-accent-fill text-on-accent'
                  : lockedUntil
                    ? 'border-line bg-surface-2 text-muted'
                    : 'border-line-strong hover:border-accent'
              }`}
            >
              {task.done ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" /> : lockedUntil && <Lock className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
            {bushra?.task.id === task.id && task.done && (
              <span key={bushra.key} className="points-pop pointer-events-none absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap font-display text-sm font-bold text-accent" aria-hidden="true">
                +{arNumber.format(task.points)}
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <button
                type="button"
                onClick={() => !disabled && void toggle(task)}
                className={`text-start font-display text-[16px] leading-7 transition ${task.done ? 'text-muted line-through decoration-1' : 'text-fg'}`}
                tabIndex={-1}
              >
                {task.title}
              </button>
              <span className="rounded-full bg-accent-soft px-2 text-xs leading-5 text-accent" title="النقاط">
                {arNumber.format(task.points)} نقطة
              </span>
            </div>
            {!plain && (
              <p className="flex items-center gap-1 text-xs text-muted">
                <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {scheduleSummary(task)}
              </p>
            )}
            {lockedUntil && (
              <p className="text-xs text-warn">
                {task.timeWindow === 'qiyam' ? `يُفتح بعد العشاء — ${formatClock(lockedUntil)}` : `يُفتح الساعة ${formatClock(lockedUntil)}`}
              </p>
            )}
            {!compact && task.description && <p className="mt-0.5 whitespace-pre-line text-sm leading-6 text-fg-2">{task.description}</p>}
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              {task.doneCount > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-muted">
                  <Users className="h-3.5 w-3.5" aria-hidden="true" />
                  {othersLabel(task.doneCount)}
                </span>
              )}
              {!compact && entries.length > 0 && (
                <button
                  type="button"
                  onClick={() => setOpenFadl((id) => (id === task.id ? null : task.id))}
                  aria-expanded={openFadl === task.id}
                  className="inline-flex items-center gap-1 text-accent hover:text-accent-strong"
                >
                  <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  فضلها
                </button>
              )}
              {task.linkUrl && (
                <a
                  href={normalizeUrl(task.linkUrl)}
                  target={isInternalPath(task.linkUrl) ? undefined : '_blank'}
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-accent hover:text-accent-strong"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  فتح الرابط
                </a>
              )}
            </div>
            {!compact && openFadl === task.id && (
              <div className="mt-2 space-y-3 rounded-sm border-s-2 border-accent bg-surface-2/50 px-3 py-2.5">
                {entries.map((f) => (
                  <div key={f.id}>
                    <p className="font-display text-sm text-accent">فضل {f.title}</p>
                    {f.texts.map((t) => (
                      <FadlText key={t.text} text={t} className="mt-1.5" />
                    ))}
                  </div>
                ))}
              </div>
            )}
            {!compact && task.timeWindow === 'qiyam' && <QiyamTimes day={task.day} place={place} onPlace={setPlace} />}
          </div>
        </div>
      </li>
    );
  };

  return (
    <div>
      {/* Progress */}
      {tasks.length > 0 && (
        <div className="mb-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className={`font-display ${compact ? 'text-sm' : 'text-base'} ${allDone ? 'text-success' : 'text-fg-2'}`}>
              {allDone ? 'أتممت مهامك — بارك الله فيك' : `أنجزت ${arNumber.format(doneCount)} من ${arNumber.format(tasks.length)}`}
              <span className="ms-2 text-xs text-muted">
                {arNumber.format(earned)} / {arNumber.format(possible)} نقطة
              </span>
            </p>
            {compact && (
              <Link to="/tasks" className="text-sm text-accent hover:text-accent-strong">
                كل المهام
              </Link>
            )}
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
            <div className="h-full rounded-full bg-accent-fill transition-[width] duration-500" style={{ width: `${(doneCount / tasks.length) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Good news after a tick */}
      {bushra && (
        <div key={bushra.key} role="status" className="bushra-in mb-3 rounded-sm border border-accent/40 bg-accent-soft px-3.5 py-3">
          <div className="flex items-start justify-between gap-2">
            <p className="flex items-center gap-1.5 font-display text-sm text-accent">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              بُشراك — أتممت «{bushra.task.title}» (+{arNumber.format(bushra.task.points)} نقطة)
            </p>
            <button type="button" onClick={() => setBushra(null)} aria-label="إغلاق" className="-m-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface">
              <X className="h-4 w-4" />
            </button>
          </div>
          {!compact && <FadlText text={bushra.text} className="mt-1.5" />}
          {compact && <p className="mt-1 line-clamp-2 text-sm leading-7 text-fg">{bushra.text.text}</p>}
        </div>
      )}

      {error && (
        <p role="alert" className="mb-2 text-sm text-danger">
          {error}
        </p>
      )}

      {compact ? (
        <ul className="divide-y divide-line">{tasks.map(row)}</ul>
      ) : (
        <div className="space-y-5">
          {GROUPS.map(({ repeat, title, hint }) => {
            const group = tasks.filter((t) => t.repeat === repeat);
            if (group.length === 0) return null;
            return (
              <section key={repeat} className="rounded-sm border border-line bg-surface px-4 py-3 sm:px-5">
                <h2 className="flex items-baseline justify-between gap-3 border-b border-line pb-2 font-display text-[18px] font-semibold">
                  {title}
                  <span className="text-xs font-normal text-muted">{hint}</span>
                </h2>
                <ul className="divide-y divide-line">{group.map(row)}</ul>
              </section>
            );
          })}
        </div>
      )}

      {data && data.tomorrow.length > 0 && (
        <p className={`mt-3 flex items-start gap-1.5 text-sm text-fg-2 ${compact ? '' : 'rounded-sm border border-dashed border-line-strong px-4 py-2.5'}`}>
          <CalendarClock className="mt-1 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          <span>
            <span className="font-display">غدًا: </span>
            {data.tomorrow.map((t) => t.title).join('، ')}
          </span>
        </p>
      )}
    </div>
  );
}
