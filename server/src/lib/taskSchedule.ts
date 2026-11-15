import type { TaskRepeat, TaskTime } from '@prisma/client';

/**
 * When a task applies and which day a tick counts for. Everything here works on
 * the member's own local date and "HH:MM" time, sent by their browser.
 */

export interface TaskSchedule {
  repeat: TaskRepeat;
  startDate: string | null;
  endDate: string | null;
  weekdays: number[];
  timeWindow: TaskTime;
  startTime: string | null;
  endTime: string | null;
}

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseDate(iso: string): Date | null {
  if (!ISO_DATE.test(iso)) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : d;
}

export function shiftDate(iso: string, days: number): string {
  const d = parseDate(iso)!;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, as JS getDay. */
export function weekdayOf(iso: string): number {
  return parseDate(iso)!.getUTCDay();
}

/** The Saturday that starts the week containing `iso` (weeks run Saturday → Friday, like the schedule). */
export function weekStartIso(iso: string): string {
  return shiftDate(iso, -((weekdayOf(iso) + 1) % 7));
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** A night task: «قيام الليل», or a range that runs past midnight (21:00 → 05:00). */
export function isOvernight(t: Pick<TaskSchedule, 'timeWindow' | 'startTime' | 'endTime'>): boolean {
  if (t.timeWindow === 'qiyam') return true;
  return t.timeWindow === 'range' && !!t.startTime && !!t.endTime && minutes(t.startTime) > minutes(t.endTime);
}

/**
 * For a night task, the time of day at which "last night" becomes "tonight".
 * Halfway through the quiet hours between the window's end and its next start,
 * so a member who wakes at 08:00 can still tick last night's qiyam.
 * Qiyam (Isha → Fajr) turns over at noon everywhere in the Arab world.
 */
export function nightCutoff(t: Pick<TaskSchedule, 'timeWindow' | 'startTime' | 'endTime'>): string {
  if (t.timeWindow !== 'range' || !t.startTime || !t.endTime) return '12:00';
  const end = minutes(t.endTime);
  const start = minutes(t.startTime);
  return hhmm(Math.floor((end + start) / 2));
}

/**
 * The day a tick at local `date` + `time` counts for. Ordinary tasks: that date.
 * Night tasks: before the cutoff it is still the night that began the evening before,
 * so qiyam prayed at 02:00 on the 16th belongs to the night of the 15th.
 */
export function effectiveDay(t: TaskSchedule, date: string, time: string): string {
  return isOvernight(t) && time < nightCutoff(t) ? shiftDate(date, -1) : date;
}

/** Which checkmark a task uses for its effective `day`. */
export function periodOf(repeat: TaskRepeat, day: string): string {
  if (repeat === 'daily') return day;
  if (repeat === 'weekly') return weekStartIso(day);
  return 'once';
}

/** Whether the task is shown for its effective `day`: within its dates, and on one of its weekdays. */
export function appliesOn(t: TaskSchedule, day: string): boolean {
  if (t.repeat === 'weekly') {
    // A weekly task shows for any week that overlaps its dates.
    const start = weekStartIso(day);
    const end = shiftDate(start, 6);
    if (t.startDate && end < t.startDate) return false;
    if (t.endDate && start > t.endDate) return false;
    return true;
  }
  if (t.startDate && day < t.startDate) return false;
  if (t.endDate && day > t.endDate) return false;
  if (t.repeat === 'daily' && t.weekdays.length > 0 && !t.weekdays.includes(weekdayOf(day))) return false;
  return true;
}

/**
 * A fixed-range task can't be ticked before its time comes: before the start
 * on an ordinary day, or between the cutoff and the start for a night task.
 * Once open it stays open until the day (or night) turns over, so a member who
 * did it on time can still tick it a little later. «قيام الليل» is locked to
 * Isha in the browser, which knows the member's city.
 */
export function notOpenYet(t: TaskSchedule, time: string): boolean {
  if (t.timeWindow !== 'range' || !t.startTime || !t.endTime) return false;
  if (!isOvernight(t)) return time < t.startTime;
  return time >= nightCutoff(t) && time < t.startTime;
}
