import { appliesOn, areMutuallyExclusive, shiftDate, weekStartIso, type TaskSchedule } from './taskSchedule.js';

/**
 * «سجلّي» and «حال المجلس»: how faithfully a task is kept over time. A slot
 * (one day of a daily task, one week of a weekly task) only counts against a
 * member when they could actually have done it — never before they joined the
 * tasks or before the task existed, never on a day they were excused, and never
 * when they did its counterpart instead (Fajr in congregation locks out «Fajr
 * on time»). The current slot is "pending", not missed: the day isn't over.
 */

export type SlotState = 'done' | 'miss' | 'off' | 'pending';

export interface HistoryTask extends TaskSchedule {
  id: string;
  title: string;
  order: number;
  createdAt: Date;
}

export interface MemberLog {
  /** "taskId|period" for every checkmark the member has. */
  done: Set<string>;
  /** Days the member was excused (illness, travel…). */
  excused: Set<string>;
  /** The member's first day with any task — nothing before it counts as missed. */
  firstDay: string | null;
}

const isoOf = (d: Date) => d.toISOString().slice(0, 10);

/** For each task, the tasks it can't be done together with. */
export function partnersOf(tasks: HistoryTask[]): Map<string, string[]> {
  return new Map(tasks.map((t) => [t.id, tasks.filter((o) => areMutuallyExclusive(t.title, o.title)).map((o) => o.id)]));
}

/** The periods of `task` in [from, to]: each applicable day, or each week (by its Saturday). */
export function periodsBetween(task: HistoryTask, from: string, to: string): string[] {
  const out: string[] = [];
  if (task.repeat === 'weekly') {
    for (let w = weekStartIso(from); w <= to; w = shiftDate(w, 7)) if (appliesOn(task, w)) out.push(w);
  } else if (task.repeat === 'daily') {
    for (let d = from; d <= to; d = shiftDate(d, 1)) if (appliesOn(task, d)) out.push(d);
  }
  return out;
}

/** Whether one period of a task was kept, missed, still open, or didn't apply to this member. */
export function slotState(task: HistoryTask, period: string, log: MemberLog, partners: string[], today: string): SlotState {
  if (log.done.has(`${task.id}|${period}`)) return 'done';
  const weekly = task.repeat === 'weekly';
  const lastDay = weekly ? shiftDate(period, 6) : period;
  const created = isoOf(task.createdAt);
  if (!log.firstDay || lastDay < log.firstDay || lastDay < created) return 'off';
  if (!weekly && log.excused.has(period)) return 'off';
  if (partners.some((p) => log.done.has(`${p}|${period}`))) return 'off';
  if (weekly ? period === weekStartIso(today) : period === today) return 'pending';
  if (period > (weekly ? weekStartIso(today) : today)) return 'off';
  return 'miss';
}

/** Kept and possible slots of `task` in [from, to]; "possible" leaves out pending and off. */
export function keepCount(task: HistoryTask, from: string, to: string, log: MemberLog, partners: string[], today: string) {
  let kept = 0;
  let possible = 0;
  for (const p of periodsBetween(task, from, to)) {
    const s = slotState(task, p, log, partners, today);
    if (s === 'done') {
      kept += 1;
      possible += 1;
    } else if (s === 'miss') possible += 1;
  }
  return { kept, possible };
}

/** Periods in a row the task was kept, back from now; off and pending slots don't break it. */
export function taskStreak(task: HistoryTask, log: MemberLog, partners: string[], today: string, horizon = 400): number {
  const from = shiftDate(today, -horizon);
  const periods = periodsBetween(task, from, today).reverse();
  let streak = 0;
  for (const p of periods) {
    const s = slotState(task, p, log, partners, today);
    if (s === 'done') streak += 1;
    else if (s === 'miss') break;
  }
  return streak;
}
