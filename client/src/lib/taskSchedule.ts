import type { Task, TaskRepeat } from './types';
import { nightOf, type Place } from './prayerTimes';

/** Mirrors server/src/lib/taskSchedule.ts: which day a tick counts for, and when a task opens. */

export function nowHHMM(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

type Times = Pick<Task, 'timeWindow' | 'startTime' | 'endTime'>;

export function isOvernight(t: Times): boolean {
  if (t.timeWindow === 'qiyam') return true;
  return t.timeWindow === 'range' && !!t.startTime && !!t.endTime && minutes(t.startTime) > minutes(t.endTime);
}

export function nightCutoff(t: Times): string {
  if (t.timeWindow !== 'range' || !t.startTime || !t.endTime) return '12:00';
  return hhmm(Math.floor((minutes(t.endTime) + minutes(t.startTime)) / 2));
}

/**
 * When the task can't be ticked yet, the time it opens ("21:00", or Isha for
 * qiyam) — else null. Once open it stays open until the day or night turns over.
 */
export function opensAt(t: MyTaskLike, place: Place, now = new Date()): Date | null {
  const time = nowHHMM(now);
  if (t.timeWindow === 'qiyam') {
    if (time < '12:00') return null; // still last night's
    const { isha } = nightOf(t.day, place);
    return now < isha ? isha : null;
  }
  if (t.timeWindow !== 'range' || !t.startTime || !t.endTime) return null;
  const closed = isOvernight(t) ? time >= nightCutoff(t) && time < t.startTime : time < t.startTime;
  if (!closed) return null;
  const at = new Date(now);
  at.setHours(Number(t.startTime.slice(0, 2)), Number(t.startTime.slice(3, 5)), 0, 0);
  return at;
}

type MyTaskLike = Times & { day: string };

export const REPEAT_LABELS: Record<TaskRepeat, string> = { daily: 'يومية', weekly: 'أسبوعية', once: 'مرة واحدة' };

/** Saturday first, like the schedule. Values are JS getDay numbers. */
export const WEEKDAYS: { day: number; short: string; name: string }[] = [
  { day: 6, short: 'سبت', name: 'السبت' },
  { day: 0, short: 'أحد', name: 'الأحد' },
  { day: 1, short: 'اثنين', name: 'الاثنين' },
  { day: 2, short: 'ثلاثاء', name: 'الثلاثاء' },
  { day: 3, short: 'أربعاء', name: 'الأربعاء' },
  { day: 4, short: 'خميس', name: 'الخميس' },
  { day: 5, short: 'جمعة', name: 'الجمعة' },
];

const clock = new Intl.DateTimeFormat('ar', { hour: 'numeric', minute: '2-digit' });
/** "21:00" → "٩:٠٠ م" */
export function formatHHMM(t: string): string {
  const d = new Date();
  d.setHours(Number(t.slice(0, 2)), Number(t.slice(3, 5)), 0, 0);
  return clock.format(d);
}

const dayMonth = new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'long' });
const fmtDay = (iso: string) => dayMonth.format(new Date(`${iso}T12:00:00`));

/** A one-line summary of when a task applies, e.g. «الاثنين والخميس · من ٩:٠٠ م إلى ٥:٠٠ ص · حتى ٣٠ نوفمبر». */
export function scheduleSummary(t: Task): string {
  const parts: string[] = [REPEAT_LABELS[t.repeat]];
  if (t.repeat === 'daily' && t.weekdays.length > 0 && t.weekdays.length < 7) {
    const names = WEEKDAYS.filter((w) => t.weekdays.includes(w.day)).map((w) => w.name);
    parts[0] = names.length > 1 ? `${names.slice(0, -1).join('، ')} و${names[names.length - 1]}` : names[0];
  }
  if (t.timeWindow === 'qiyam') parts.push('من العشاء إلى الفجر');
  else if (t.timeWindow === 'range' && t.startTime && t.endTime) parts.push(`من ${formatHHMM(t.startTime)} إلى ${formatHHMM(t.endTime)}`);
  if (t.startDate && t.endDate) parts.push(`من ${fmtDay(t.startDate)} إلى ${fmtDay(t.endDate)}`);
  else if (t.startDate) parts.push(`ابتداءً من ${fmtDay(t.startDate)}`);
  else if (t.endDate) parts.push(`حتى ${fmtDay(t.endDate)}`);
  return parts.join(' · ');
}
