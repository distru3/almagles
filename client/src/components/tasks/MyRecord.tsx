import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Archive, CalendarDays, Flame, GraduationCap, Medal, Sprout, Trees, TrendingUp, Wheat, type LucideIcon } from 'lucide-react';
import { lessonsLabel, partLabel, worksLabel as worksWord } from '../../lib/learning';
import { api, ApiError } from '../../lib/api';
import type { HistoryTaskSummary, SlotState, TaskHistory } from '../../lib/types';
import { gregorianShort, hijriDate, hijriShort, todayISO } from '../../lib/dates';
import { nowHHMM } from '../../lib/taskSchedule';
import { loadPlace, prayerClockFor } from '../../lib/prayerTimes';
import { DAWAM, NO_WASTE, SADDIDU } from '../../lib/fadail';
import { nextStop, timesWord, worldFor } from '../../lib/taskWorlds';
import { gardenWeeks, hijriMonthKey, hijriMonthLabel, milestones, monthHarvest, weeklyPoints, type GardenDay, type MilestoneKind } from '../../lib/taskHistory';
import EmptyState from '../EmptyState';
import Spinner from '../Spinner';
import FadlText from './FadlText';
import { REASON_LABELS } from './ExcuseControl';

const arNumber = new Intl.NumberFormat('ar');
const ar = (n: number) => arNumber.format(n);
const percent = new Intl.NumberFormat('ar', { style: 'percent', maximumFractionDigits: 0 });


function Section({ icon: Icon, title, aside, children }: { icon: LucideIcon; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-sm border border-line bg-surface px-4 py-3 sm:px-5">
      <h2 className="flex items-center justify-between gap-3 border-b border-line pb-2 font-display text-[18px] font-semibold">
        <span className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-accent" aria-hidden="true" />
          {title}
        </span>
        {aside && <span className="text-xs font-normal text-muted">{aside}</span>}
      </h2>
      <div className="pt-3">{children}</div>
    </section>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-sm border border-line bg-surface px-3 py-3 text-center">
      <p className="font-display text-[22px] font-bold text-accent tabular-nums">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

// One gold, deeper with more work — a single-hue scale, read the same in both themes.
const LEVEL_CLASS = ['bg-surface-2', 'bg-accent-fill/30', 'bg-accent-fill/55', 'bg-accent-fill/80', 'bg-accent-fill'] as const;

function cellClass(d: GardenDay, selected: boolean): string {
  if (d.future) return 'invisible';
  const base = d.count === 0 && d.excused ? 'bg-surface-2 ring-1 ring-inset ring-fg-2/50' : LEVEL_CLASS[d.level];
  return `${base} ${selected ? 'outline outline-2 outline-offset-1 outline-fg' : ''}`;
}

/** «بستان العام»: six months of days, a column per week (Saturday on top), tap a day to see it. */
function Garden({ history }: { history: TaskHistory }) {
  const weeks = useMemo(() => gardenWeeks(history), [history]);
  const [selected, setSelected] = useState(history.today);
  const logOf = useMemo(() => new Map(history.log.map((l) => [l.day, l.items])), [history]);
  const excuseOf = useMemo(() => new Map(history.excused.map((e) => [e.day, e.reason])), [history]);
  const items = logOf.get(selected) ?? [];
  const reason = excuseOf.get(selected);

  // A month name above the week in which each Hijri month begins.
  const months = weeks
    .map((w, i) => ({ i, key: hijriMonthKey(w[6].day), label: hijriMonthLabel(w[6].day) }))
    .filter((m, idx, all) => idx > 0 && m.key !== all[idx - 1].key);

  return (
    <Section icon={Sprout} title="بستان العام" aside="آخر ستة أشهر">
      <div className="mb-1 h-4 overflow-hidden text-[10px] text-muted" aria-hidden="true">
        <div className="grid h-full gap-[2px]" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
          {months.map((m) => (
            <span key={m.key} className="whitespace-nowrap" style={{ gridColumn: `${m.i + 1} / span ${Math.min(4, weeks.length - m.i)}` }}>
              {m.label}
            </span>
          ))}
        </div>
      </div>
      <div className="grid grid-flow-col grid-rows-7 gap-[2px]" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
        {weeks.flat().map((d) => {
          const label = `${hijriDate(d.day)}: ${d.count ? worksWord(d.count) : d.excused ? 'يوم عذر' : 'لا شيء'}`;
          return (
            <button
              key={d.day}
              type="button"
              disabled={d.future}
              onClick={() => setSelected(d.day)}
              aria-label={label}
              aria-pressed={selected === d.day}
              title={label}
              className={`aspect-square w-full rounded-[2px] ${cellClass(d, selected === d.day)}`}
            />
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1">
          أقل
          {LEVEL_CLASS.map((c) => (
            <span key={c} className={`h-2.5 w-2.5 rounded-[2px] ${c}`} aria-hidden="true" />
          ))}
          أكثر
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-[2px] bg-surface-2 ring-1 ring-inset ring-fg-2/50" aria-hidden="true" />
          يوم عذر
        </span>
      </div>

      {/* The chosen day, in words */}
      <div className="mt-3 rounded-sm border border-line bg-surface-2/40 px-3 py-2.5" aria-live="polite">
        <p className="font-display text-[15px]">
          {selected === history.today ? 'اليوم · ' : ''}
          {hijriDate(selected)}
          <span className="ms-2 text-xs font-normal text-muted">{gregorianShort(selected)}</span>
        </p>
        {items.length > 0 ? (
          <ul className="mt-1.5 space-y-1 text-sm">
            {items.map((it, i) => (
              <li key={`${it.taskId}-${i}`} className="flex items-center gap-2">
                {it.learning ? (
                  <GraduationCap className="h-3.5 w-3.5 shrink-0 text-ilm" aria-label="درس" />
                ) : (
                  <span className="mx-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-fill" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1">
                  {history.titles[it.taskId] ?? (it.learning ? 'درس' : 'مهمة')}
                  {it.madeUp && <span className="ms-1.5 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent">تدارك</span>}
                  {it.progress !== undefined && <span className="ms-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-fg-2">{partLabel(it.progress)}</span>}
                </span>
                <span className={`text-xs tabular-nums ${it.learning ? 'text-ilm' : 'text-accent'}`}>+{ar(it.points)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted">
            {reason
              ? `يوم عذر (${REASON_LABELS[reason]}) — وأجرك محفوظ إن شاء الله.`
              : selected === history.today
                ? 'اليوم ما زال أمامك — ولو بمهمة واحدة.'
                : 'لا شيء مسجّل في هذا اليوم.'}
          </p>
        )}
      </div>
    </Section>
  );
}

/** Points per week for the last twelve weeks; tap or hover a bar to read it. */
function WeeklyBars({ history }: { history: TaskHistory }) {
  const weeks = useMemo(() => weeklyPoints(history), [history]);
  const current = weeks.length - 1;
  const [active, setActive] = useState(current);
  const max = Math.max(1, ...weeks.map((w) => w.points));
  const best = weeks.reduce((b, w, i) => (w.points > weeks[b].points ? i : b), 0);
  const shown = weeks[active];

  return (
    <Section icon={TrendingUp} title="نقاطك أسبوعًا بأسبوع" aside="آخر ١٢ أسبوعًا">
      <p className="mb-2 text-sm" aria-live="polite">
        <span className="font-display">{active === current ? 'هذا الأسبوع' : `أسبوع ${hijriShort(shown.week)}`}: </span>
        <span className="font-display text-accent tabular-nums">{ar(shown.points)}</span> نقطة
        {shown.ilm > 0 && (
          <span className="ms-1 text-xs text-fg-2">
            (عبادة {ar(shown.points - shown.ilm)} · <span className="text-ilm">علم {ar(shown.ilm)}</span>)
          </span>
        )}
        {active === best && shown.points > 0 && <span className="ms-2 text-xs text-muted">— أفضل أسابيعك هنا</span>}
      </p>
      <div className="flex h-28 items-end gap-[2px] border-b border-line" onMouseLeave={() => setActive(current)}>
        {weeks.map((w, i) => (
          <button
            key={w.week}
            type="button"
            onClick={() => setActive(i)}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            aria-label={`${i === current ? 'هذا الأسبوع' : `أسبوع ${hijriShort(w.week)}`}: ${ar(w.points)} نقطة`}
            className="flex h-full flex-1 items-end"
          >
            {/* Worship below in gold, «طلب العلم» stacked on top in ink. */}
            <span className="flex w-full flex-col overflow-hidden rounded-t-[4px]" style={{ height: w.points ? `max(2px, ${(w.points / max) * 100}%)` : '0' }}>
              <span className={`w-full transition-colors ${i === current || i === active ? 'bg-ilm-fill' : 'bg-ilm-fill/55'}`} style={{ flexGrow: w.ilm }} />
              <span
                className={`w-full transition-colors ${i === current ? 'bg-accent-fill' : i === active ? 'bg-accent-fill/80' : 'bg-accent-fill/45'}`}
                style={{ flexGrow: w.points - w.ilm }}
              />
            </span>
          </button>
        ))}
      </div>
      {weeks.some((w) => w.ilm > 0) && (
        <p className="mt-1.5 flex gap-4 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-[2px] bg-accent-fill" aria-hidden="true" />
            العبادة
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-[2px] bg-ilm-fill" aria-hidden="true" />
            طلب العلم
          </span>
        </p>
      )}
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>{hijriShort(weeks[0].week)}</span>
        <span>هذا الأسبوع</span>
      </div>
    </Section>
  );
}

/** «حصاد الشهر»: this Hijri month so far beside the month before. */
function Harvest({ history }: { history: TaskHistory }) {
  const { current, previous } = useMemo(() => monthHarvest(history), [history]);
  const ahead = current.ticks > previous.ticks && previous.ticks > 0;
  const col = (m: typeof current, note: string, strong: boolean) => (
    <div className={`rounded-sm border px-3 py-2.5 ${strong ? 'border-accent/40 bg-accent-soft/50' : 'border-line'}`}>
      <p className="font-display text-[15px]">
        {m.label} <span className="text-xs font-normal text-muted">{note}</span>
      </p>
      <p className="mt-1 font-display text-[20px] font-bold text-accent tabular-nums">{worksWord(m.ticks)}</p>
      <p className="text-xs text-muted">
        {ar(m.points)} نقطة · في {ar(m.days)} {m.days >= 3 && m.days <= 10 ? 'أيام' : 'يومًا'}
      </p>
    </div>
  );
  return (
    <Section icon={Wheat} title="حصاد الشهر">
      <div className="grid gap-2 sm:grid-cols-2">
        {col(current, '(حتى اليوم)', true)}
        {col(previous, '(الشهر الماضي)', false)}
      </div>
      {ahead ? (
        <p className="mt-2 text-sm text-fg-2">بارك الله لك — زدت على شهر {previous.label}، وما زال في الشهر بقية.</p>
      ) : (
        <FadlText text={SADDIDU} className="mt-2 text-center" />
      )}
    </Section>
  );
}

const SLOT_CLASS: Record<SlotState, string> = {
  done: 'bg-accent-fill',
  miss: 'bg-line-strong',
  off: 'bg-surface-2',
  pending: 'bg-transparent ring-1 ring-inset ring-accent',
};
const SLOT_LABEL: Record<SlotState, string> = { done: 'أنجزتها', miss: 'فاتتك', off: 'ليست عليك', pending: 'لم ينتهِ بعد' };

/** A task's world: its icon, what it builds, and how many times so far. */
function WorldHeading({ task, children }: { task: HistoryTaskSummary; children?: ReactNode }) {
  const world = worldFor(task);
  const Icon = world.icon;
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-xs text-accent">{world.name}</p>
        <p className="truncate font-display text-[15px]">{task.title}</p>
        <p className="text-xs text-muted">
          {task.total ? `${world.verb} ${timesWord(task.total)}` : 'لم تبدأها بعد — أول غرسة تنتظرك'}
          {task.lastDay && ` · آخرها ${hijriShort(task.lastDay)}`}
        </p>
      </div>
      {children}
    </div>
  );
}

/** Its next round number of times, as a thin bar: «المحطة التالية: ٣٠ مرة». */
function NextStop({ total }: { total: number }) {
  const stop = nextStop(total);
  if (!stop || total === 0) return null;
  return (
    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
        <div className="h-full rounded-full bg-accent-fill/70" style={{ width: `${Math.max(stop.progress * 100, 3)}%` }} />
      </div>
      <span className="shrink-0">المحطة التالية: {timesWord(stop.at)}</span>
    </div>
  );
}

/**
 * «ثباتي في كل مهمة»: every current task — daily, weekly and one-off — as the
 * world it builds, how often it was kept lately (30 days / 8 weeks), its run,
 * its next stop, and under «فضلها» the text the image rests on.
 */
function Steadfast({ history }: { history: TaskHistory }) {
  if (history.tasks.length === 0) return null;
  return (
    <Section icon={Flame} title="ثباتي في كل مهمة" aside="آخر ٣٠ يومًا">
      <ul className="divide-y divide-line">
        {history.tasks.map((t) => {
          const unit = t.repeat === 'weekly' ? 'أسبوعًا' : 'يومًا';
          const world = worldFor(t);
          return (
            <li key={t.id} className="py-3">
              <WorldHeading task={t}>
                <span className="shrink-0 text-end text-xs text-muted tabular-nums">
                  {t.repeat === 'once' ? (
                    t.total ? (
                      <span className="text-success">أنجزتها</span>
                    ) : (
                      'مرة واحدة'
                    )
                  ) : t.possible ? (
                    `${ar(t.kept)} من ${ar(t.possible)} ${unit}`
                  ) : null}
                  {t.streak >= 2 && (
                    <span className="mt-0.5 flex items-center justify-end gap-0.5 text-warn" title="متتالية دون انقطاع">
                      <Flame className="h-3.5 w-3.5" aria-hidden="true" />
                      {ar(t.streak)} متتالية
                    </span>
                  )}
                </span>
              </WorldHeading>
              {t.strip.length > 0 && (
                <div className="mt-2 flex gap-[2px]" role="img" aria-label={`${t.title}: ${SLOT_LABEL.done} ${ar(t.kept)} من ${ar(t.possible)}`}>
                  {t.strip.map((s, i) => (
                    <span key={i} className={`h-2.5 flex-1 rounded-[2px] ${SLOT_CLASS[s]}`} />
                  ))}
                </div>
              )}
              <NextStop total={t.total} />
              <details className="mt-1.5 text-xs">
                <summary className="cursor-pointer font-display text-accent hover:text-accent-strong">فضلها</summary>
                <FadlText text={world.text} className="mt-1" />
              </details>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
        {(Object.keys(SLOT_LABEL) as SlotState[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1">
            <span className={`h-2.5 w-2.5 rounded-[2px] ${SLOT_CLASS[s]}`} aria-hidden="true" />
            {SLOT_LABEL[s]}
          </span>
        ))}
      </p>
      <p className="mt-2 text-xs leading-6 text-muted">
        أيام العذر، وما سبق بدايتك، والمهمة التي أدّيت بديلتها (كالفجر في جماعة بدل «في وقتها») لا تُحسب عليك.
      </p>
    </Section>
  );
}

/** «من سجلّك السابق»: tasks that have ended or were archived — what you built in them stays. */
function PastTasks({ history }: { history: TaskHistory }) {
  if (history.past.length === 0) return null;
  return (
    <Section icon={Archive} title="من سجلّك السابق" aside="مهام انتهت">
      <ul className="divide-y divide-line">
        {history.past.map((t) => (
          <li key={t.id} className="py-2.5">
            <WorldHeading task={t} />
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">انتهت هذه المهام، وبقي ما عملته فيها.</p>
      <FadlText text={NO_WASTE} className="mt-1 text-center" />
    </Section>
  );
}

/**
 * «رحلة العلم» in the record: lessons done, their points and «سلسلة العلم»,
 * beside the worship above — or a quiet way in for a member not on it.
 */
function LearningInRecord({ history }: { history: TaskHistory }) {
  const l = history.learning;
  if (!l.enrolled && l.lessons === 0) {
    return (
      <Link to="/learn" className="flex items-center gap-3 rounded-sm border border-dashed border-line-strong px-4 py-3 text-sm text-fg-2 transition hover:border-ilm">
        <GraduationCap className="h-5 w-5 shrink-0 text-ilm" aria-hidden="true" />
        <span>
          سجلّك في العبادة يكبر — وللعلم حقل آخر تزرعه مع إخوانك: <span className="font-display text-ilm">«رحلة العلم»</span>
        </span>
      </Link>
    );
  }
  const share = history.days.reduce((n, d) => n + d.points, 0);
  return (
    <Section icon={GraduationCap} title="رحلة العلم في سجلّك" aside={<Link to="/learn" className="text-ilm hover:underline">درس اليوم</Link>}>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-sm border border-line px-3 py-2.5 text-center">
          <p className="font-display text-[20px] font-bold text-ilm tabular-nums">{ar(l.lessons)}</p>
          <p className="text-xs text-muted">دروس أتممتها</p>
        </div>
        <div className="rounded-sm border border-line px-3 py-2.5 text-center">
          <p className="font-display text-[20px] font-bold text-ilm tabular-nums">{ar(l.points)}</p>
          <p className="text-xs text-muted">نقطة في طلب العلم</p>
        </div>
        <div className="rounded-sm border border-line px-3 py-2.5 text-center">
          <p className="font-display text-[20px] font-bold text-ilm tabular-nums">{ar(l.streak)}</p>
          <p className="text-xs text-muted">{l.bestStreak > l.streak ? `سلسلة العلم (أطولها ${ar(l.bestStreak)})` : 'سلسلة العلم'}</p>
        </div>
      </div>
      {share > 0 && (
        <p className="mt-2 text-xs text-muted">
          طلب العلم {percent.format(l.points / share)} من نقاطك كلها — {lessonsLabel(l.lessons)} على الطريق حتى الآن.
        </p>
      )}
    </Section>
  );
}

const MILESTONE_ICON: Record<MilestoneKind, LucideIcon> = { first: Sprout, ticks: Medal, level: Trees, streak: Flame, ilm: GraduationCap };

/** «محطاتك»: the milestones along the way, newest first. */
function Milestones({ history }: { history: TaskHistory }) {
  const list = useMemo(() => milestones(history), [history]);
  if (list.length === 0) return null;
  return (
    <Section icon={Medal} title="محطاتك">
      <ol className="space-y-3 border-s-2 border-line ps-4">
        {list.map((m) => {
          const Icon = MILESTONE_ICON[m.kind];
          return (
            <li key={`${m.kind}-${m.day}-${m.title}`} className="relative">
              <span className="absolute -start-[27px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent-soft text-accent">
                <Icon className="h-3 w-3" aria-hidden="true" />
              </span>
              <p className="font-display text-[15px]">{m.title}</p>
              <p className="text-xs text-muted">
                {hijriDate(m.day)} · {gregorianShort(m.day)}
              </p>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

/**
 * «سجلّي»: the member's own record since their first task — the garden of
 * days, points by week, the month's harvest, how steady each task is, and the
 * milestones on the way. Seen by the member only.
 */
export default function MyRecord() {
  const [history, setHistory] = useState<TaskHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const { fajr, isha } = prayerClockFor(loadPlace());
    api<TaskHistory>(`/tasks/history?date=${todayISO()}&time=${nowHHMM()}&fajr=${fajr}&isha=${isha}`)
      .then((res) => active && setHistory(res))
      .catch((err) => active && setError(err instanceof ApiError ? err.message : 'تعذّر تحميل سجلّك'));
    return () => {
      active = false;
    };
  }, []);

  if (error) return <p className="rounded border border-danger/40 bg-danger-soft px-4 py-3 text-danger">{error}</p>;
  if (!history) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }
  if (history.days.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="سجلّك يبدأ بأول مهمة"
        description="كل ما تنجزه يُحفظ هنا يومًا بيوم، لترى بستانك يكبر — ابدأ من «مهامي»."
      />
    );
  }

  const ticks = history.days.reduce((n, d) => n + d.count, 0);
  const points = history.days.reduce((n, d) => n + d.points, 0);

  return (
    <div className="space-y-5">
      <div>
        <div className="grid grid-cols-3 gap-2">
          <Tile value={ar(ticks)} label="عملًا منذ بدأت" />
          <Tile value={ar(points)} label="نقطة" />
          <Tile value={ar(history.days.length)} label="يومًا عملت فيه" />
        </div>
        <p className="mt-2 text-xs text-muted">
          بدأت في {hijriDate(history.days[0].day)} — وكل ما عملته محفوظ هنا، لا يُمحى.
        </p>
      </div>
      <LearningInRecord history={history} />
      <Garden history={history} />
      <WeeklyBars history={history} />
      <Harvest history={history} />
      <Steadfast history={history} />
      <PastTasks history={history} />
      <Milestones history={history} />
      <div className="text-center">
        <FadlText text={DAWAM} />
        <p className="mt-1 text-xs text-muted">هذا السجلّ لك وحدك — النقاط للتشجيع، والأجر عند الله.</p>
      </div>
    </div>
  );
}
