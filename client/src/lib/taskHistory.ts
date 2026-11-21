import { LEVELS } from './rewards';
import type { TaskHistory } from './types';

/**
 * The numbers behind «سجلّي», worked out from the member's history: the
 * six-month garden, points per week, this Hijri month against the last, and
 * the milestones along the way. Dates are plain "YYYY-MM-DD" days.
 */

export function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The Saturday that starts the week of `iso` (weeks run Saturday → Friday). */
export function saturdayOf(iso: string): string {
  const wd = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return shiftIso(iso, -((wd + 1) % 7));
}

export interface GardenDay {
  day: string;
  count: number;
  points: number;
  excused: boolean;
  future: boolean;
  /** 0 (nothing) … 4 (the member's fullest days), relative to their own best day. */
  level: 0 | 1 | 2 | 3 | 4;
}

/** «بستان العام»: one column per week from `from` (a Saturday) to this week, seven days each. */
export function gardenWeeks(h: TaskHistory): GardenDay[][] {
  const byDay = new Map(h.days.map((d) => [d.day, d]));
  const excused = new Set(h.excused.map((e) => e.day));
  const max = Math.max(1, ...h.days.filter((d) => d.day >= h.from).map((d) => d.count));
  const weeks: GardenDay[][] = [];
  for (let w = h.from; w <= h.today; w = shiftIso(w, 7)) {
    weeks.push(
      Array.from({ length: 7 }, (_, i) => {
        const day = shiftIso(w, i);
        const d = byDay.get(day);
        const count = d?.count ?? 0;
        return {
          day,
          count,
          points: d?.points ?? 0,
          excused: excused.has(day),
          future: day > h.today,
          level: (count === 0 ? 0 : Math.max(1, Math.ceil((count / max) * 4))) as GardenDay['level'],
        };
      }),
    );
  }
  return weeks;
}

/** Points in each of the last `n` weeks, oldest first; the last is this week so far. */
export function weeklyPoints(h: TaskHistory, n = 12): { week: string; points: number }[] {
  const current = saturdayOf(h.today);
  const weeks = Array.from({ length: n }, (_, i) => ({ week: shiftIso(current, -7 * (n - 1 - i)), points: 0 }));
  const index = new Map(weeks.map((w, i) => [w.week, i]));
  for (const d of h.days) {
    const i = index.get(saturdayOf(d.day));
    if (i !== undefined) weeks[i].points += d.points;
  }
  return weeks;
}

const hijriMonth = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { year: 'numeric', month: 'numeric' });
const hijriMonthName = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { month: 'long' });

/** "1448-5" for any day of Jumada al-Ula 1448 — the Umm al-Qura month a day falls in. */
export function hijriMonthKey(iso: string): string {
  const parts = hijriMonth.formatToParts(new Date(`${iso}T12:00:00Z`));
  return `${parts.find((p) => p.type === 'year')?.value}-${parts.find((p) => p.type === 'month')?.value}`;
}

export function hijriMonthLabel(iso: string): string {
  return hijriMonthName.format(new Date(`${iso}T12:00:00Z`));
}

export interface MonthHarvest {
  label: string;
  ticks: number;
  points: number;
  days: number;
}

/** «حصاد الشهر»: this Hijri month so far, and the whole of the month before. */
export function monthHarvest(h: TaskHistory): { current: MonthHarvest; previous: MonthHarvest } {
  const currentKey = hijriMonthKey(h.today);
  // Step back day by day to the last day of the previous month.
  let d = h.today;
  while (hijriMonthKey(d) === currentKey) d = shiftIso(d, -1);
  const previousKey = hijriMonthKey(d);
  const sum = (key: string, label: string): MonthHarvest => {
    const days = h.days.filter((x) => hijriMonthKey(x.day) === key);
    return { label, ticks: days.reduce((n, x) => n + x.count, 0), points: days.reduce((n, x) => n + x.points, 0), days: days.length };
  };
  return { current: sum(currentKey, hijriMonthLabel(h.today)), previous: sum(previousKey, hijriMonthLabel(d)) };
}

export type MilestoneKind = 'first' | 'ticks' | 'level' | 'streak';

export interface Milestone {
  kind: MilestoneKind;
  day: string;
  title: string;
}

const arNumber = new Intl.NumberFormat('ar');
const TICK_MILESTONES = [50, 100, 250, 500, 1000, 2000, 5000];

function daysWord(n: number): string {
  if (n === 2) return 'يومان';
  if (n >= 3 && n <= 10) return `${arNumber.format(n)} أيام`;
  return `${arNumber.format(n)} يومًا`;
}

/**
 * «محطاتك»: the first task, round numbers of tasks, each new level of the
 * garden, and the longest run of days (excused days keep a run going, as on
 * «ساحة الهمّة»). Newest first.
 */
export function milestones(h: TaskHistory): Milestone[] {
  const out: Milestone[] = [];
  if (h.days.length === 0) return out;
  out.push({ kind: 'first', day: h.days[0].day, title: 'أول مهمة أنجزتها — بداية الطريق' });

  let ticks = 0;
  let points = 0;
  let level = 0;
  for (const d of h.days) {
    const before = ticks;
    ticks += d.count;
    points += d.points;
    for (const m of TICK_MILESTONES) if (before < m && ticks >= m) out.push({ kind: 'ticks', day: d.day, title: `المهمة رقم ${arNumber.format(m)}` });
    while (level + 1 < LEVELS.length && points >= LEVELS[level + 1].min) {
      level += 1;
      out.push({ kind: 'level', day: d.day, title: `صار بستانك «${LEVELS[level].name}»` });
    }
  }

  const active = [...new Set([...h.days.map((d) => d.day), ...h.excused.map((e) => e.day)])].filter((d) => d <= h.today).sort();
  let best = { length: 0, end: '' };
  let run = 0;
  let prev: string | null = null;
  for (const day of active) {
    run = prev && shiftIso(prev, 1) === day ? run + 1 : 1;
    if (run > best.length) best = { length: run, end: day };
    prev = day;
  }
  if (best.length >= 3) out.push({ kind: 'streak', day: best.end, title: `أطول سلسلة لك: ${daysWord(best.length)} على العمل` });

  return out.sort((a, b) => b.day.localeCompare(a.day));
}
