import { BookOpen, FileText, Headphones, MonitorPlay, Sprout, type LucideIcon } from 'lucide-react';
import { FADAIL, DAWAM, type Text } from './fadail';
import { toISODate } from './dates';
import type { LearningKind, MyLearningItem } from './types';

/**
 * «رحلة العلم»: a shared calendar of lessons, Fridays left for rest. The rules
 * that matter (points, catch-up, streak) live on the server in
 * server/src/lib/learning.ts; this file only presents them.
 */

export const KINDS: Record<LearningKind, { label: string; done: string; icon: LucideIcon }> = {
  reading: { label: 'قراءة', done: 'أتممت القراءة', icon: BookOpen },
  video: { label: 'درس مرئي', done: 'شاهدت الدرس', icon: MonitorPlay },
  audio: { label: 'درس صوتي', done: 'استمعت إلى الدرس', icon: Headphones },
  article: { label: 'مقالة', done: 'قرأت المقالة', icon: FileText },
  practice: { label: 'تطبيق', done: 'أتممت التطبيق', icon: Sprout },
};
export const KIND_ORDER: LearningKind[] = ['reading', 'video', 'audio', 'article', 'practice'];

/** Mirrors LEARN_MAKEUP_DAYS in server/src/lib/learning.ts. */
export const LEARN_MAKEUP_DAYS = 7;

/** The texts on «طلب العلم», curated in fadail.ts. */
export const ILM_TEXTS: Text[] = FADAIL.find((f) => f.id === 'ilm')?.texts ?? [DAWAM];

export const arNumber = new Intl.NumberFormat('ar');

const at = (iso: string) => new Date(`${iso}T12:00:00`);

/** Friday is «يوم الاستجمام». */
export function isRestDay(iso: string): boolean {
  return at(iso).getDay() === 5;
}

export function shiftIso(iso: string, days: number): string {
  const d = at(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** "2026-11" → the weeks of that month, Saturday first; days outside it are null. */
export function monthGrid(month: string): (string | null)[][] {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1, 12);
  const days = new Date(y, m, 0, 12).getDate();
  const lead = (first.getDay() + 1) % 7;
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(toISODate(new Date(y, m - 1, d, 12)));
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

export const monthOf = (iso: string) => iso.slice(0, 7);
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + by, 1, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  return { from: `${month}-01`, to: toISODate(new Date(y, m, 0, 12)) };
}
export const monthLabel = (month: string) => new Intl.DateTimeFormat('ar', { month: 'long', year: 'numeric' }).format(at(`${month}-01`));
export const hijriMonthLabel = (month: string) =>
  new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { month: 'long', year: 'numeric' }).format(at(`${month}-15`));
export const dayNumber = (iso: string) => arNumber.format(at(iso).getDate());

/** Saturday-first short weekday names for the calendar head. */
export const WEEK_HEAD = ['سبت', 'أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة'];

/** «درس واحد / درسان / ٣ دروس / ١١ درسًا». */
export function lessonsLabel(n: number): string {
  if (n === 1) return 'درس واحد';
  if (n === 2) return 'درسان';
  if (n >= 3 && n <= 10) return `${arNumber.format(n)} دروس`;
  return `${arNumber.format(n)} درسًا`;
}

/** Tasks and lessons together: «عمل واحد / عملان / ٣ أعمال / ١١ عملًا». */
export function worksLabel(n: number): string {
  if (n === 1) return 'عمل واحد';
  if (n === 2) return 'عملان';
  if (n >= 3 && n <= 10) return `${arNumber.format(n)} أعمال`;
  return `${arNumber.format(n)} عملًا`;
}

/** «دقيقة / دقيقتان / ٥ دقائق / ٢٠ دقيقة». */
export function minutesLabel(n: number): string {
  if (n === 1) return 'دقيقة';
  if (n === 2) return 'دقيقتان';
  if (n >= 3 && n <= 10) return `${arNumber.format(n)} دقائق`;
  return `${arNumber.format(n)} دقيقة`;
}

/** «يوم / يومان / ٣ أيام / ١١ يومًا». */
export function daysLabel(n: number): string {
  if (n === 1) return 'يوم واحد';
  if (n === 2) return 'يومان';
  if (n >= 3 && n <= 10) return `${arNumber.format(n)} أيام`;
  return `${arNumber.format(n)} يومًا`;
}

/** How a day looks on «خريطة الرحلة». */
export type DayState = 'rest' | 'empty' | 'done' | 'partial' | 'open' | 'missed' | 'today' | 'upcoming' | 'before';

export function dayState(day: string, items: MyLearningItem[], today: string, startDay: string | null): DayState {
  if (isRestDay(day)) return 'rest';
  if (items.length === 0) return 'empty';
  const done = items.filter((i) => i.done).length;
  if (done === items.length) return 'done';
  if (day > today) return 'upcoming';
  if (day === today) return done ? 'partial' : 'today';
  if (done) return 'partial';
  // Before joining a lesson is no debt; it can still be done while it's within the week.
  if (startDay && day < startDay) return items.some((i) => i.worth !== null) ? 'open' : 'before';
  return items.some((i) => i.worth !== null) ? 'open' : 'missed';
}

/** A warm word for where the member stands — never a reproach. */
export function milestone(s: { done: number; total: number; streak: number; due: number; keptDue: number }): string {
  const share = s.total ? s.done / s.total : 0;
  if (s.total && s.done >= s.total) return 'أتممت كل ما وُضع من الرحلة حتى الآن — بارك الله في علمك وعملك.';
  if (s.streak >= 30) return 'شهر من الثبات على طلب العلم — هذه همّة الرجال.';
  if (s.streak >= 7) return 'أسبوع كامل لم تنقطع فيه — ثبّتك الله.';
  if (share >= 0.5) return 'جاوزت نصف الرحلة — ما بقي أقرب مما مضى.';
  if (s.done >= 10) return 'عشرة دروس وأكثر — العلم يُجمع هكذا، درسًا بعد درس.';
  if (s.done >= 1) return 'بدأت الطريق — ثبّت خطوك يومًا بعد يوم.';
  return 'أول الطريق خطوة — ابدأ بدرس اليوم.';
}

/**
 * How much of a lesson running from `startPage` to `endPage` is read when the
 * member stopped at `page` — the same measure as the server's pageProgress:
 * 0 before it starts, at most 99 (only «أتممت» finishes it), null without a range.
 */
export function pageProgress(startPage: number | null, endPage: number | null, page: number): number | null {
  if (!startPage || !endPage || endPage < startPage) return null;
  if (page < startPage) return 0;
  const share = Math.floor(((page - startPage + 1) / (endPage - startPage + 1)) * 100);
  return Math.min(99, Math.max(1, share));
}

/** «أنجزت بعضه» for a lesson with no pages to measure by. */
export const PART_CHOICES = [
  { progress: 25, label: 'ربعه' },
  { progress: 50, label: 'نصفه' },
  { progress: 75, label: 'أكثره' },
] as const;

/** «أنجزت نصفه» / «أنجزت ٤٠٪ منه»: part of a lesson, in words. */
export function partLabel(progress: number): string {
  const named = PART_CHOICES.find((c) => c.progress === progress);
  return named ? `أنجزت ${named.label}` : `أنجزت ${arNumber.format(progress)}٪ منه`;
}
