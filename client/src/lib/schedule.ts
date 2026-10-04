import type { ScheduleColumn, ScheduleItem } from './types';
import { addDays, toISODate, weekStart } from './dates';

/** Saturday (ISO date) of the week containing `iso`. */
export function weekKeyOf(iso: string): string {
  return toISODate(weekStart(new Date(`${iso}T12:00:00`)));
}

/** The seven ISO dates Saturday → Friday starting at `weekKey`. */
export function weekDates(weekKey: string): string[] {
  const start = new Date(`${weekKey}T12:00:00`);
  return Array.from({ length: 7 }, (_, i) => toISODate(addDays(start, i)));
}

export function shiftWeek(weekKey: string, weeks: number): string {
  return toISODate(addDays(new Date(`${weekKey}T12:00:00`), weeks * 7));
}

/** Distinct non-empty values, most used first — feeds the typing suggestions. */
export function rankedValues(values: (string | null | undefined)[]): string[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    const t = v?.trim();
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
}

/** Text for a session's link: its own label, else a generic one. */
export function linkText(item: Pick<ScheduleItem, 'linkLabel'>): string {
  return item.linkLabel?.trim() || 'فتح الرابط';
}

/** "الشيخ: … · الكمية: …" for the columns that have a value. */
export function customSummary(item: Pick<ScheduleItem, 'customValues'>, columns: ScheduleColumn[]): string {
  return columns
    .map((c) => (item.customValues?.[c.id] ? `${c.label}: ${item.customValues[c.id]}` : ''))
    .filter(Boolean)
    .join(' · ');
}

// ---------------------------------------------------------------- CSV (same format as almagles-schedule)

export const BASE_CSV_HEADERS = ['date', 'time', 'section', 'title', 'notes', 'link'] as const;

function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function exportCsv(items: ScheduleItem[], columns: ScheduleColumn[]): string {
  const lines = [[...BASE_CSV_HEADERS, ...columns.map((c) => c.label)].map(csvEscape).join(',')];
  for (const i of items) {
    lines.push(
      [i.date, i.timeLabel, i.section ?? '', i.title, i.notes ?? '', i.linkUrl ?? '', ...columns.map((c) => i.customValues?.[c.id] ?? '')]
        .map(csvEscape)
        .join(','),
    );
  }
  // BOM so Excel shows Arabic correctly.
  return `﻿${lines.join('\n')}\n`;
}

export function downloadText(text: string, filename: string, type = 'text/csv;charset=utf-8;'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function templateCsv(columns: ScheduleColumn[]): string {
  return exportCsv(
    [
      {
        id: 'example',
        date: '2026-08-22',
        weekdayKey: 'sat',
        timeLabel: 'فجر',
        section: 'مفاهيم شرعية',
        title: 'مثال: أضف عنوان الجلسة',
        notes: 'مثال: فوائد وملاحظات',
        linkUrl: 'https://example.com',
        linkLabel: null,
        customValues: Object.fromEntries(columns.map((c) => [c.id, 'مثال'])),
        sortOrder: 0,
      },
    ],
    columns,
  );
}

export interface ParsedCsvRow {
  date: string;
  timeLabel: string;
  section: string;
  title: string;
  notes: string;
  linkUrl: string;
  /** Values keyed by column label (new labels become new columns). */
  custom: Record<string, string>;
}

export interface CsvParseResult {
  rows: ParsedCsvRow[];
  /** 1-based line numbers that were skipped, with the reason. */
  skipped: { line: number; reason: string }[];
  customLabels: string[];
}

/** RFC 4180 parser: quoted fields may contain commas, quotes and newlines. */
export function parseCsv(text: string): CsvParseResult {
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const raw: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      raw.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    raw.push(row);
  }
  if (raw.length === 0) throw new Error('الملف فارغ');

  const header = raw[0].map((h) => h.trim());
  if (header.slice(0, BASE_CSV_HEADERS.length).map((h) => h.toLowerCase()).join(',') !== BASE_CSV_HEADERS.join(',')) {
    throw new Error('صيغة الملف غير صحيحة — يجب أن يبدأ السطر الأول بالأعمدة: date,time,section,title,notes,link');
  }
  const customLabels = header.slice(BASE_CSV_HEADERS.length).filter(Boolean);

  const rows: ParsedCsvRow[] = [];
  const skipped: CsvParseResult['skipped'] = [];
  for (let r = 1; r < raw.length; r++) {
    const cells = raw[r];
    if (cells.every((c) => c.trim() === '')) continue;
    const get = (i: number) => (cells[i] ?? '').trim();
    const date = get(0);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      skipped.push({ line: r + 1, reason: 'تاريخ غير صالح' });
      continue;
    }
    if (!get(3)) {
      skipped.push({ line: r + 1, reason: 'بدون عنوان' });
      continue;
    }
    const custom: Record<string, string> = {};
    header.slice(BASE_CSV_HEADERS.length).forEach((label, k) => {
      const v = get(BASE_CSV_HEADERS.length + k);
      if (label && v) custom[label] = v;
    });
    rows.push({ date, timeLabel: get(1), section: get(2), title: get(3), notes: get(4), linkUrl: get(5), custom });
  }
  return { rows, skipped, customLabels };
}
