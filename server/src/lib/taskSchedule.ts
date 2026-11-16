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

/** A night task: «قيام الليل», or a range that runs past midnight (21:00 → 05:00). */
export function isOvernight(t: Pick<TaskSchedule, 'timeWindow' | 'startTime' | 'endTime'>): boolean {
  if (t.timeWindow === 'qiyam') return true;
  return t.timeWindow === 'range' && !!t.startTime && !!t.endTime && minutes(t.startTime) > minutes(t.endTime);
}

/**
 * Today's Fajr and Isha where the member is ("HH:MM", their local clock). The
 * browser works them out for the member's city and sends them along, since
 * «قيام الليل» runs from Isha to Fajr and those differ from Cairo to Casablanca.
 */
export interface PrayerClock {
  fajr: string;
  isha: string;
}

/** Used when a request doesn't say (an old page still open): roughly Cairo's year-round. */
export const DEFAULT_PRAYERS: PrayerClock = { fajr: '05:00', isha: '19:00' };

/** Takes the times a browser sent, keeping each only if it's a plausible Fajr / Isha for the Arab world. */
export function prayerClock(fajr: string | undefined, isha: string | undefined): PrayerClock {
  const ok = (v: string | undefined, from: string, to: string) => !!v && HH_MM.test(v) && v >= from && v <= to;
  return {
    fajr: ok(fajr, '02:00', '08:00') ? fajr! : DEFAULT_PRAYERS.fajr,
    isha: ok(isha, '16:30', '23:59') ? isha! : DEFAULT_PRAYERS.isha,
  };
}

/**
 * For a night task, the time of day at which the night is over: Fajr for
 * «قيام الليل», the range's end for a fixed one (21:00 → 05:00). From then on
 * the task is tonight's, locked until it opens again; a night that went
 * unticked is made up from «تدارك ما فاتك».
 */
export function nightCutoff(t: Pick<TaskSchedule, 'timeWindow' | 'startTime' | 'endTime'>, prayers: PrayerClock = DEFAULT_PRAYERS): string {
  if (t.timeWindow === 'qiyam') return prayers.fajr;
  return t.endTime ?? '00:00';
}

/**
 * The day a tick at local `date` + `time` counts for. Ordinary tasks: that date.
 * Night tasks: until the night ends it's still the night that began the evening
 * before, so qiyam prayed at 02:00 on the 16th belongs to the night of the 15th.
 */
export function effectiveDay(t: TaskSchedule, date: string, time: string, prayers: PrayerClock = DEFAULT_PRAYERS): string {
  return isOvernight(t) && time < nightCutoff(t, prayers) ? shiftDate(date, -1) : date;
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

/** How many days back a missed daily task can still be made up («تدارك»). */
export const MAKEUP_DAYS = 3;
/** Extra points on the first tick after two or more days away. */
export const COMEBACK_BONUS = 5;

/**
 * Points for making up a task missed on `day` when it's now `today`: the full
 * points the very next day — ﴿جَعَلَ اللَّيْلَ وَالنَّهَارَ خِلْفَةً﴾, what's missed
 * in one is made up in the other — and half (rounded up) after that.
 */
export function makeupPoints(points: number, day: string, today: string): number {
  return shiftDate(day, 1) === today ? points : Math.ceil(points / 2);
}

/**
 * A task can't be ticked outside its time. «قيام الليل»: only from Isha until
 * Fajr. A fixed night range: only inside it. A same-day range opens at its
 * start and stays open until midnight, so a member who did it on time can
 * still tick it a little later.
 */
export function notOpenYet(t: TaskSchedule, time: string, prayers: PrayerClock = DEFAULT_PRAYERS): boolean {
  if (t.timeWindow === 'qiyam') return time >= prayers.fajr && time < prayers.isha;
  if (t.timeWindow !== 'range' || !t.startTime || !t.endTime) return false;
  if (!isOvernight(t)) return time < t.startTime;
  return time >= t.endTime && time < t.startTime;
}
