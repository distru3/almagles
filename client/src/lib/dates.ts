export const WEEKDAY_KEYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export const WEEKDAY_NAMES: Record<WeekdayKey, string> = {
  sat: 'السبت',
  sun: 'الأحد',
  mon: 'الاثنين',
  tue: 'الثلاثاء',
  wed: 'الأربعاء',
  thu: 'الخميس',
  fri: 'الجمعة',
};

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

const hijriFormatter = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const hijriShortFormatter = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
  day: 'numeric',
  month: 'long',
});

const hijriDayFormatter = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
  day: 'numeric',
});

/** e.g. "٤ صفر ١٤٤٨ هـ" */
export function hijriDate(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  return hijriFormatter.format(date);
}

/** e.g. "٤ صفر" without the year */
export function hijriShort(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  return hijriShortFormatter.format(date);
}

/** e.g. "٤" — Hijri day number */
export function hijriDayNumber(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  return hijriDayFormatter.format(date);
}

/** e.g. "من ٤ صفر إلى ١٠ صفر ١٤٤٨ هـ" */
export function formatHijriWeekRange(start: Date, end: Date): string {
  const startIso = toISODate(start);
  const endIso = toISODate(end);
  return `من ${hijriShort(startIso)} إلى ${hijriDate(endIso)}`;
}

export function gregorianLong(iso: string): string {
  return new Intl.DateTimeFormat('ar', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${iso}T12:00:00`));
}

/** e.g. "٨ أغسطس ٢٠٢٦" — full Gregorian date without the weekday. */
export function gregorianShort(iso: string): string {
  return new Intl.DateTimeFormat('ar', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${iso}T12:00:00`));
}

// Week starts Saturday — find the Saturday of the week containing `date`.
export function weekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  const diff = (d.getDay() + 1) % 7; // 0 = Sunday
  d.setDate(d.getDate() - diff);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function formatWeekLabel(start: Date): string {
  return new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'long' }).format(start);
}

export function isTodayKey(iso: string): boolean {
  return iso === todayISO();
}

export function weekdayKey(date: Date): WeekdayKey {
  return WEEKDAY_KEYS[(date.getDay() + 1) % 7];
}