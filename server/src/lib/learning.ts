import { shiftDate, weekdayOf } from './taskSchedule.js';

/**
 * «رحلة العلم»: the rules of the shared learning calendar. Everything works on
 * the member's own local date ("YYYY-MM-DD"), sent by their browser.
 */

/** Friday is «يوم الاستجمام»: no lessons are set on it, and it never breaks a streak. */
export function isRestDay(iso: string): boolean {
  return weekdayOf(iso) === 5;
}

/** How far back a missed lesson can still be caught up. */
export const LEARN_MAKEUP_DAYS = 7;

/**
 * Points for finishing a lesson set for `day` when it's now `today`: the full
 * points on its day and the day after, half within the week, and null when it
 * can't be done (not yet come, or too long ago).
 */
export function learningPoints(points: number, day: string, today: string): number | null {
  if (day > today || day < shiftDate(today, -LEARN_MAKEUP_DAYS)) return null;
  return day === today || shiftDate(day, 1) === today ? points : Math.ceil(points / 2);
}

/**
 * Points for taking a lesson from `from`% to `to`% done when it's now `today`:
 * the share of its points for that stretch, at the rate of the day it's done
 * on (so a lesson half read on its day and finished late earns full points for
 * the first half and half points for the rest). Null when it can't be done now.
 */
export function progressPoints(points: number, day: string, today: string, from: number, to: number): number | null {
  const rate = learningPoints(points, day, today);
  if (rate === null) return null;
  return Math.ceil((rate * Math.max(0, to - from)) / 100);
}

/**
 * How much of a lesson that runs from `startPage` to `endPage` is read when
 * the member stopped at `page`: 0 before it starts, at most 99 — reaching the
 * last page isn't finishing it; «أتممت الدرس» is. Null when the lesson has no
 * page range to measure by.
 */
export function pageProgress(startPage: number | null, endPage: number | null, page: number): number | null {
  if (!startPage || !endPage || endPage < startPage) return null;
  if (page < startPage) return 0;
  const share = Math.floor(((page - startPage + 1) / (endPage - startPage + 1)) * 100);
  return Math.min(99, Math.max(1, share));
}

/**
 * «سلسلة العلم»: lesson days in a row on which the member finished at least
 * one lesson. Days with no lesson (Fridays above all), excused days and days
 * before they joined are passed over — they neither break nor lengthen it.
 * Today, while it isn't over, doesn't break it either.
 */
export function learningStreak(
  lessonDays: Iterable<string>,
  doneDays: Set<string>,
  excused: Set<string>,
  today: string,
  startDay: string | null,
): { streak: number; bestStreak: number } {
  const counted = [...new Set(lessonDays)]
    .filter((d) => d <= today && !excused.has(d) && !isRestDay(d))
    // Before joining, only what they did counts; what they didn't is no gap.
    .filter((d) => doneDays.has(d) || !startDay || d >= startDay)
    .sort();
  let best = 0;
  let run = 0;
  for (const d of counted) {
    if (doneDays.has(d)) {
      run += 1;
      best = Math.max(best, run);
    } else if (d !== today) {
      run = 0;
    }
  }
  return { streak: run, bestStreak: best };
}
