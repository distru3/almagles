import { useEffect, useState } from 'react';
import { GraduationCap, HandHeart, Sprout, Target, Users } from 'lucide-react';
import { lessonsLabel, worksLabel } from '../../lib/learning';
import { api } from '../../lib/api';
import type { TaskCommunity } from '../../lib/types';
import { hijriShort, todayISO } from '../../lib/dates';
import { nowHHMM } from '../../lib/taskSchedule';
import { loadPlace, prayerClockFor } from '../../lib/prayerTimes';
import { worldFor } from '../../lib/taskWorlds';

const arNumber = new Intl.NumberFormat('ar');
const ar = (n: number) => arNumber.format(n);
const pct = (r: number) => `${ar(Math.round(r * 100))}٪`;

function tasksWord(n: number): string {
  if (n === 1) return 'مهمة واحدة';
  if (n === 2) return 'مهمتين';
  if (n >= 3 && n <= 10) return `${ar(n)} مهام`;
  return `${ar(n)} مهمة`;
}

function brothersWord(n: number): string {
  if (n === 1) return 'أخ واحد';
  if (n === 2) return 'أخوان';
  if (n >= 3 && n <= 10) return `${ar(n)} إخوة`;
  return `${ar(n)} أخًا`;
}

/** One task, with its world's icon and a bar for how often it's kept; the percentage is always written beside it. */
function RateRow({ task }: { task: TaskCommunity['tasks'][number] }) {
  const world = worldFor(task);
  const Icon = world.icon;
  const rate = task.rate;
  return (
    <li className="py-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex min-w-0 flex-1 items-center gap-1.5" title={world.name}>
          <Icon className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          <span className="truncate">{task.title}</span>
          {task.repeat === 'once' && <span className="shrink-0 text-[11px] text-muted">(مرة واحدة)</span>}
        </span>
        <span className="shrink-0 font-display text-fg-2 tabular-nums">{pct(rate)}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
        <div className="h-full rounded-full bg-accent-fill" style={{ width: `${Math.max(rate * 100, 2)}%` }} />
      </div>
    </li>
  );
}

/** Tasks done by everyone, day by day for eight weeks; tap or hover a bar to read it. */
function Activity({ series }: { series: TaskCommunity['series'] }) {
  const last = series.length - 1;
  const [active, setActive] = useState(last);
  const max = Math.max(1, ...series.map((s) => s.count));
  const shown = series[active];
  return (
    <div>
      <p className="mb-1.5 text-xs text-muted" aria-live="polite">
        {active === last ? 'اليوم' : hijriShort(shown.day)}: <span className="font-display text-fg-2 tabular-nums">{worksLabel(shown.count)}</span>
        {shown.ilm > 0 && <span className="text-ilm"> (منها {lessonsLabel(shown.ilm)})</span>}
      </p>
      <div className="flex h-16 items-end gap-[2px] border-b border-line" onMouseLeave={() => setActive(last)}>
        {series.map((s, i) => (
          <button
            key={s.day}
            type="button"
            onClick={() => setActive(i)}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            aria-label={`${hijriShort(s.day)}: ${worksLabel(s.count)}${s.ilm ? `، منها ${lessonsLabel(s.ilm)}` : ''}`}
            className="flex h-full flex-1 items-end"
          >
            {/* Worship in gold below, lessons in ink on top. */}
            <span className="flex w-full flex-col overflow-hidden rounded-t-[2px]" style={{ height: s.count ? `max(2px, ${(s.count / max) * 100}%)` : '0' }}>
              <span className={`w-full ${i === active ? 'bg-ilm-fill' : 'bg-ilm-fill/55'}`} style={{ flexGrow: s.ilm }} />
              <span className={`w-full ${i === active ? 'bg-accent-fill' : 'bg-accent-fill/45'}`} style={{ flexGrow: s.count - s.ilm }} />
            </span>
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>{hijriShort(series[0].day)}</span>
        <span>اليوم</span>
      </div>
    </div>
  );
}

/**
 * «حال المجلس» on «ساحة الهمّة»: the circle's month together, with no names —
 * what we did, what we hold on to, what needs our himma, and «همّة الأسبوع»,
 * the least-kept task of last month to revive together this week.
 */
export default function CommunityPulse() {
  const [data, setData] = useState<TaskCommunity | null>(null);

  useEffect(() => {
    let active = true;
    const { fajr, isha } = prayerClockFor(loadPlace());
    api<TaskCommunity>(`/tasks/community?date=${todayISO()}&time=${nowHHMM()}&fajr=${fajr}&isha=${isha}`)
      .then((res) => active && setData(res))
      .catch(() => {
        /* the rest of the board still works without it */
      });
    return () => {
      active = false;
    };
  }, []);

  if (!data || (data.members === 0 && data.totals.lessons === 0)) return null;
  const { totals, tasks, focus } = data;
  // With few tasks, one list; otherwise the three kept best and the three that need us most.
  const split = tasks.length >= 4;
  const top = split ? tasks.slice(0, 3) : tasks;
  const low = split ? tasks.slice(-3).reverse().filter((t) => !top.includes(t)) : [];
  const weekRate = focus && focus.week.possible ? focus.week.kept / focus.week.possible : null;

  return (
    <section className="rounded-sm border border-line bg-surface px-4 py-3 sm:px-5" aria-label="حال المجلس">
      <h2 className="flex items-center justify-between gap-3 border-b border-line pb-2 font-display text-[18px] font-semibold">
        <span className="flex items-center gap-2">
          <Users className="h-5 w-5 text-accent" aria-hidden="true" />
          حال المجلس
        </span>
        <span className="text-xs font-normal text-muted">آخر ٣٠ يومًا · دون أسماء</span>
      </h2>

      <div className="mt-3 rounded-sm border border-accent/40 bg-accent-soft/50 px-3 py-2.5">
        <p className="font-display text-[15px] text-accent">أنجزنا معًا</p>
        <p className="mt-0.5 text-sm leading-7">
          <span className="font-display text-[20px] font-bold text-accent">{tasksWord(totals.ticks)}</span>
          {totals.nights > 0 && <>، منها {ar(totals.nights)} من قيام الليل</>}
          {totals.madeUp > 0 && <>، وتداركنا {ar(totals.madeUp)} ممّا فات</>} — شارك فيها {brothersWord(data.members)}.
        </p>
        {totals.lessons > 0 && (
          <p className="mt-1 flex items-start gap-1.5 border-t border-accent/20 pt-1.5 text-sm leading-7">
            <GraduationCap className="mt-1.5 h-4 w-4 shrink-0 text-ilm" aria-hidden="true" />
            <span>
              وفي طلب العلم أتممنا <span className="font-display text-[18px] font-bold text-ilm">{lessonsLabel(totals.lessons)}</span> من «رحلة العلم» — سار فيها{' '}
              {brothersWord(totals.learners)}.
            </span>
          </p>
        )}
      </div>

      {focus && (
        <div className="mt-3 rounded-sm border border-line px-3 py-2.5">
          <p className="flex items-center gap-1.5 font-display text-[15px]">
            <Target className="h-4 w-4 text-accent" aria-hidden="true" />
            همّة الأسبوع
          </p>
          <p className="mt-1 text-sm leading-7">
            لنُحيِ معًا هذا الأسبوع: <span className="font-display text-accent">«{focus.title}»</span>
            <span className="text-muted"> — حافظنا عليها الشهر الماضي بنسبة {pct(focus.before)}.</span>
          </p>
          {weekRate !== null && (
            <>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                <div className="h-full rounded-full bg-accent-fill transition-[width] duration-500" style={{ width: `${Math.max(weekRate * 100, 2)}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted">
                هذا الأسبوع حتى الآن: {pct(weekRate)}
                {weekRate > focus.before ? ' — تقدّم مبارك، زادكم الله همّة.' : ' — مهمة واحدة منك اليوم ترفعها.'}
              </p>
            </>
          )}
        </div>
      )}

      {tasks.length > 0 && (
        <div className={`mt-3 grid gap-4 ${low.length ? 'sm:grid-cols-2' : ''}`}>
          <div>
            <p className="flex items-center gap-1.5 font-display text-[15px]">
              <Sprout className="h-4 w-4 text-accent" aria-hidden="true" />
              {split ? 'ما نحافظ عليه' : 'مهامنا'}
            </p>
            <ul>
              {top.map((t) => (
                <RateRow key={t.id} task={t} />
              ))}
            </ul>
          </div>
          {low.length > 0 && (
            <div>
              <p className="flex items-center gap-1.5 font-display text-[15px]">
                <HandHeart className="h-4 w-4 text-accent" aria-hidden="true" />
                ما يحتاج همّتنا
              </p>
              <ul>
                {low.map((t) => (
                  <RateRow key={t.id} task={t} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <p className="mt-1 text-[11px] text-muted">النسبة: كم مرة أُدّيت المهمة من كل مرة أمكن أداؤها، دون أيام العذر؛ وفي مهام المرة الواحدة: كم أخًا أدّاها.</p>

      <div className="mt-4">
        <p className="mb-1 font-display text-[15px]">نشاط المجلس يومًا بيوم</p>
        <Activity series={data.series} />
      </div>
    </section>
  );
}
