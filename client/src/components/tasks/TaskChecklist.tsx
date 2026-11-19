import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, CalendarClock, Check, ExternalLink, History, ListChecks, Lock, Sparkles, Users, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { MyTask, MyTasks, TaskRepeat } from '../../lib/types';
import { todayISO } from '../../lib/dates';
import { isInternalPath, normalizeUrl } from '../../lib/url';
import { DAWAM, NO_WASTE, SADDIDU, fadailFor, type Text } from '../../lib/fadail';
import { formatClock, loadPlace, prayerClockFor, type Place } from '../../lib/prayerTimes';
import { REPEAT_LABELS, areMutuallyExclusive, findConflictingTask, nowHHMM, opensAt, phaseKey, scheduleSummary } from '../../lib/taskSchedule';
import Spinner from '../Spinner';
import FadlText from './FadlText';
import QiyamTimes from './QiyamTimes';
import MakeUpSection from './MakeUpSection';
import ExcuseControl from './ExcuseControl';

/** Mirrors COMEBACK_BONUS in server/src/lib/taskSchedule.ts. */
const COMEBACK_BONUS = 5;

/** The good-news card: after an on-time tick, a make-up, or the first tick after time away. */
interface Bushra {
  kind: 'done' | 'makeup' | 'comeback';
  taskId: string;
  title: string;
  points: number;
  text: Text;
  key: number;
}

export { REPEAT_LABELS };

const arNumber = new Intl.NumberFormat('ar');

/** Section headings, in the order they're shown. */
const GROUPS: { repeat: TaskRepeat; title: string; hint: string }[] = [
  { repeat: 'daily', title: 'مهام اليوم', hint: 'تتجدد مع صلاة الفجر' },
  { repeat: 'weekly', title: 'مهام الأسبوع', hint: 'تتجدد فجر كل سبت' },
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
  const [bushra, setBushra] = useState<Bushra | null>(null);
  const [place, setPlace] = useState<Place>(loadPlace);
  const [, setTick] = useState(0);
  // When the list was loaded: reload when the page comes back after a while, or past midnight.
  const loaded = useRef({ date: todayISO(), at: Date.now(), phase: '' });
  const ticks = useRef(0);
  const placeRef = useRef(place);
  placeRef.current = place;
  const tasksRef = useRef<MyTask[]>([]);
  tasksRef.current = data?.tasks ?? [];

  const load = useCallback(async () => {
    const date = todayISO();
    const { fajr, isha } = prayerClockFor(placeRef.current);
    loaded.current = { date, at: Date.now(), phase: phaseKey(tasksRef.current, placeRef.current) };
    try {
      const res = await api<MyTasks>(`/tasks?date=${date}&time=${nowHHMM()}&fajr=${fajr}&isha=${isha}`);
      loaded.current.phase = phaseKey(res.tasks, placeRef.current);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر تحميل المهام');
    }
  }, []);

  // Another city means other prayer times: reload so qiyam shows the right night.
  const firstPlace = useRef(true);
  useEffect(() => {
    if (firstPlace.current) {
      firstPlace.current = false;
      return;
    }
    void load();
  }, [place, load]);

  /** After an excuse is added or removed: the list (make-ups drop out) and the garden (streak). */
  const reloadAll = () => {
    void load();
    onTicked?.();
  };

  useEffect(() => {
    void load();
    const onFocus = () => (loaded.current.date !== todayISO() || Date.now() - loaded.current.at > 10 * 60_000) && void load();
    window.addEventListener('focus', onFocus);
    // Each minute: re-render so tasks unlock when their time comes, and reload
    // when Fajr, Isha or a night range's edge has passed (the night has changed).
    const timer = window.setInterval(() => {
      setTick((t) => t + 1);
      if (phaseKey(tasksRef.current, placeRef.current) !== loaded.current.phase) void load();
    }, 60_000);
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
    const key = ++ticks.current;
    if (done) {
      setBushra({ kind: 'done', taskId: task.id, title: task.title, points: task.points, text: bushraFor(task, key + new Date().getDate()), key });
    } else if (bushra?.taskId === task.id) {
      setBushra(null);
    }
    try {
      const res = await api<{ points: number; comeback: boolean }>(`/tasks/${task.id}/done`, {
        method: 'PUT',
        body: { date: todayISO(), time: nowHHMM(), done, ...prayerClockFor(place) },
      });
      // «عودة حميدة»: back after two days away — the bonus and a warm word.
      if (done && res.comeback) {
        setBushra((b) => (b?.key === key ? { ...b, kind: 'comeback', points: res.points, text: SADDIDU } : b));
      }
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
  if (tasks.length === 0 && !data?.tomorrow.length && !data?.missed.length) {
    return compact ? null : (
      <div className="rounded-sm border border-dashed border-line-strong px-5 py-10 text-center">
        <ListChecks className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
        <p className="mt-2 font-display text-lg">لا توجد مهام اليوم</p>
        <p className="mt-1 text-sm text-muted">ستظهر هنا المهام التي يضعها المشرفون.</p>
      </div>
    );
  }

  // Tasks that are not locked out by a completed mutually exclusive task
  const activeTasks = tasks.filter((t) => !findConflictingTask(t, tasks));
  const doneCount = tasks.filter((t) => t.done).length;
  const allDone = activeTasks.length > 0 && doneCount >= activeTasks.length;
  const earned = tasks.filter((t) => t.done).reduce((s, t) => s + t.points, 0);
  const possible = useMemo(() => {
    let sum = 0;
    const handledMutex = new Set<string>();
    for (const t of tasks) {
      if (t.done) {
        sum += t.points;
      } else {
        const conflict = tasks.find((o) => o.id !== t.id && areMutuallyExclusive(t.title, o.title));
        if (!conflict) {
          sum += t.points;
        } else if (conflict.done) {
          // Locked out by conflict: 0 points possible
        } else {
          const pairKey = [t.id, conflict.id].sort().join('|');
          if (!handledMutex.has(pairKey)) {
            handledMutex.add(pairKey);
            sum += Math.max(t.points, conflict.points);
          }
        }
      }
    }
    return sum;
  }, [tasks]);

  const row = (task: MyTask) => {
    const conflict = findConflictingTask(task, tasks);
    const isLockedOut = !task.done && conflict !== undefined;
    const lockedUntil = task.done || isLockedOut ? null : opensAt(task, place);
    const disabled = pending.has(task.id) || lockedUntil !== null || isLockedOut;
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
                  : isLockedOut
                    ? 'border-line bg-surface-2 text-muted opacity-60 cursor-not-allowed'
                    : lockedUntil
                      ? 'border-line bg-surface-2 text-muted'
                      : 'border-line-strong hover:border-accent'
              }`}
              title={isLockedOut && conflict ? `أنجزت «${conflict.title}» — لا يُجمع بينهما` : undefined}
            >
              {task.done ? (
                <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
              ) : (lockedUntil || isLockedOut) && (
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
            {bushra && bushra.kind !== 'makeup' && bushra.taskId === task.id && task.done && (
              <span key={bushra.key} className="points-pop pointer-events-none absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap font-display text-sm font-bold text-accent" aria-hidden="true">
                +{arNumber.format(bushra.points)}
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <button
                type="button"
                onClick={() => !disabled && void toggle(task)}
                className={`text-start font-display text-[16px] leading-7 transition ${task.done ? 'text-muted line-through decoration-1' : isLockedOut ? 'text-muted' : 'text-fg'}`}
                tabIndex={-1}
              >
                {task.title}
              </button>
              <span className="rounded-full bg-accent-soft px-2 text-xs leading-5 text-accent" title="النقاط">
                {arNumber.format(task.points)} نقطة
              </span>
            </div>
            {isLockedOut && conflict && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                <Lock className="h-3 w-3 shrink-0 text-accent/70" aria-hidden="true" />
                <span>أنجزت «{conflict.title}» — لا يُجمع بينهما</span>
              </p>
            )}
            {!plain && (
              <p className="flex items-center gap-1 text-xs text-muted">
                <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {scheduleSummary(task)}
              </p>
            )}
            {lockedUntil && (
              <p className="text-xs text-warn">
                {task.timeWindow === 'qiyam'
                  ? `قيام الليلة يبدأ بعد صلاة العشاء — ${formatClock(lockedUntil)}`
                  : `يُفتح الساعة ${formatClock(lockedUntil)}`}
              </p>
            )}
            {lockedUntil && task.timeWindow === 'qiyam' && data?.missed.some((m) => m.id === task.id) && (
              <p className="text-xs text-muted">انتهت ليلة البارحة بأذان الفجر — إن فاتتك فتداركها نهارًا من «تدارك ما فاتك» بنقاطها كاملة.</p>
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
              {allDone ? 'أتممت مهامك — بارك الله فيك' : `أنجزت ${arNumber.format(doneCount)} من ${arNumber.format(activeTasks.length)}`}
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
            <div className="h-full rounded-full bg-accent-fill transition-[width] duration-500" style={{ width: `${(doneCount / Math.max(1, activeTasks.length)) * 100}%` }} />
          </div>
        </div>
      )}

      {!compact && data && <ExcuseControl excuses={data.excuses} currentDay={data.tasks[0]?.day} onChange={reloadAll} />}

      {/* Good news after a tick */}
      {bushra && (
        <div key={bushra.key} role="status" className="bushra-in mb-3 rounded-sm border border-accent/40 bg-accent-soft px-3.5 py-3">
          <div className="flex items-start justify-between gap-2">
            <p className="flex items-center gap-1.5 font-display text-sm text-accent">
              <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
              {bushra.kind === 'makeup'
                ? `تداركت «${bushra.title}» (+${arNumber.format(bushra.points)} نقطة) — وعاد يومها إلى سلسلتك`
                : bushra.kind === 'comeback'
                  ? `عودة حميدة — أتممت «${bushra.title}» (+${arNumber.format(bushra.points)} نقطة، منها ${arNumber.format(COMEBACK_BONUS)} هدية العودة)`
                  : `بُشراك — أتممت «${bushra.title}» (+${arNumber.format(bushra.points)} نقطة)`}
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
          {data && data.missed.length > 0 && (
            <MakeUpSection
              key={data.missed.map((m) => `${m.id}|${m.day}`).join()}
              place={place}
              missed={data.missed}
              onMadeUp={(m, points, text) => {
                const key = ++ticks.current;
                setBushra({ kind: 'makeup', taskId: m.id, title: m.title, points, text, key });
                window.scrollTo({ top: 0, behavior: 'smooth' });
                onTicked?.();
              }}
            />
          )}
        </div>
      )}

      {compact && data && data.missed.length > 0 && (
        <Link to="/tasks" className="mt-3 flex items-center gap-1.5 text-sm text-warn hover:underline">
          <History className="h-4 w-4" aria-hidden="true" />
          {data.missed.length === 1 ? 'فاتتك مهمة في الأيام الماضية — تداركها' : `فاتتك ${arNumber.format(data.missed.length)} مهام في الأيام الماضية — تداركها`}
        </Link>
      )}

      {data && data.tomorrow.length > 0 && (
        <p className={`mt-3 flex items-start gap-1.5 text-sm text-fg-2 ${compact ? '' : 'rounded-sm border border-dashed border-line-strong px-4 py-2.5'}`}>
          <CalendarClock className="mt-1 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          <span>
            <span className="font-display">غدًا (مع الفجر): </span>
            {data.tomorrow.map((t) => t.title).join('، ')}
          </span>
        </p>
      )}
    </div>
  );
}
