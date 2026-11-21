import { BookMarked, BookOpen, Bookmark, Lightbulb, RotateCcw, type LucideIcon } from 'lucide-react';
import { api } from './api';
import { fadailFor, normalizeArabic } from './fadail';

/**
 * «المصحف»: the pages are static files made from Tanzil's verified text by
 * client/scripts/quran-pages.mjs (public/quran/…); only «علاماتي» go through
 * the API. Ayat are shown exactly as in the files — nothing here edits them.
 */

export interface Ayah {
  s: number;
  a: number;
  /** The ayah, as in the text. For a surah's first ayah, without its opening basmala. */
  t: string;
  /** The basmala that opens a surah's first ayah, shown as its own line (not on al-Fatiha or at-Tawba). */
  b?: string;
}

export interface QuranPageData {
  page: number;
  juz: number;
  source: string;
  ayat: Ayah[];
}

export interface Sura {
  n: number;
  name: string;
  ayas: number;
  type: 'مكية' | 'مدنية';
  page: number;
}

export interface QuranIndex {
  source: string;
  notice: string[];
  pages: number;
  suras: Sura[];
  juzs: { n: number; s: number; a: number; page: number }[];
}

export const PAGE_COUNT = 604;

let indexPromise: Promise<QuranIndex> | null = null;
const pages = new Map<number, Promise<QuranPageData>>();

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

export function loadIndex(): Promise<QuranIndex> {
  indexPromise ??= getJson<QuranIndex>('/quran/index.json').catch((err) => {
    indexPromise = null;
    throw err;
  });
  return indexPromise;
}

/** One page of the mushaf; each is fetched once and kept for the visit. */
export function loadPage(n: number): Promise<QuranPageData> {
  let p = pages.get(n);
  if (!p) {
    p = getJson<QuranPageData>(`/quran/pages/${String(n).padStart(3, '0')}.json`).catch((err) => {
      pages.delete(n);
      throw err;
    });
    pages.set(n, p);
  }
  return p;
}

export const clampPage = (n: number) => Math.min(PAGE_COUNT, Math.max(1, Math.round(n) || 1));

// ---------------------------------------------------------------- «علاماتي»

export type MarkKind = 'tilawa' | 'hifz' | 'muraja' | 'tadabbur' | 'custom';
export const BUILT_IN_MARKS = ['tilawa', 'hifz', 'muraja', 'tadabbur'] as const;

export const MARK_KINDS: Record<MarkKind, { name: string; hint: string; icon: LucideIcon }> = {
  tilawa: { name: 'تلاوة', hint: 'إلى أين وصلت قراءتك', icon: BookOpen },
  hifz: { name: 'حفظ', hint: 'موضع حفظك الجديد', icon: BookMarked },
  muraja: { name: 'مراجعة', hint: 'إلى أين وصلت مراجعتك', icon: RotateCcw },
  tadabbur: { name: 'تدبّر', hint: 'آية تتأمّلها', icon: Lightbulb },
  custom: { name: 'خاصة', hint: 'علامة باسم تختاره', icon: Bookmark },
};

export interface QuranMark {
  id: string;
  kind: MarkKind;
  label: string | null;
  sura: number;
  aya: number;
  page: number;
  updatedAt: string;
}

export const fetchMarks = () => api<{ marks: QuranMark[] }>('/quran/bookmarks').then((r) => r.marks);
export const setMark = (kind: (typeof BUILT_IN_MARKS)[number], sura: number, aya: number) =>
  api<{ mark: QuranMark }>(`/quran/bookmarks/${kind}`, { method: 'PUT', body: { sura, aya } }).then((r) => r.mark);
export const addCustomMark = (label: string, sura: number, aya: number) =>
  api<{ mark: QuranMark }>('/quran/bookmarks', { method: 'POST', body: { label, sura, aya } }).then((r) => r.mark);
export const renameCustomMark = (id: string, label: string) =>
  api<{ mark: QuranMark }>(`/quran/bookmarks/custom/${id}`, { method: 'PATCH', body: { label } }).then((r) => r.mark);
export const deleteMark = (id: string) => api(`/quran/bookmarks/${id}`, { method: 'DELETE' });

// ---------------------------------------------------------------- reading position on this device

const LAST_PAGE_KEY = 'almagles_quran_page';

export function loadLastPage(): number | null {
  try {
    const n = Number(localStorage.getItem(LAST_PAGE_KEY));
    return n >= 1 && n <= PAGE_COUNT ? n : null;
  } catch {
    return null;
  }
}

export function saveLastPage(n: number): void {
  try {
    localStorage.setItem(LAST_PAGE_KEY, String(n));
  } catch {
    /* private mode — the page still works */
  }
}

// ---------------------------------------------------------------- display

// Arabic-Indic digits always, as in a printed mushaf: some browsers give 'ar' Western digits,
// and the end-of-ayah ornament only forms around Arabic-Indic ones.
const arDigits = new Intl.NumberFormat('ar-u-nu-arab', { useGrouping: false });
export const arNumber = (n: number) => arDigits.format(n);

/** The end-of-ayah sign with its number; the mushaf font draws them as one ornament. */
export const ayahEnd = (n: number) => `۝${arNumber(n)}`;

// ---------------------------------------------------------------- tasks → the mushaf

/**
 * «افتح المصحف» on a task in «مهامي»: a Qur'an task opens the mark that goes
 * with it (a memorising task → «حفظ», revision → «مراجعة», a reading ward →
 * «تلاوة»), and «الكهف» / «الملك» open their surah. Matched like «فضلها».
 */
export function quranLinkFor(task: { title: string; description?: string | null }): string | null {
  const text = `${task.title} ${task.description ?? ''}`;
  const ids = new Set(fadailFor(text, 5).map((f) => f.id));
  // «مراجعة الدرس» or «حفظ المتن» is about a lesson, not the mushaf.
  const lesson = ids.has('ilm') && !/قران|مصحف|سوره/.test(normalizeArabic(text));
  if (lesson) return null;
  if (ids.has('kahf')) return '/quran?sura=18';
  if (ids.has('mulk')) return '/quran?sura=67';
  if (normalizeArabic(text).includes('مراجع')) return '/quran?mark=muraja';
  if (ids.has('hifz')) return '/quran?mark=hifz';
  if (ids.has('tadabbur')) return '/quran?mark=tadabbur';
  if (ids.has('quran')) return '/quran?mark=tilawa';
  return null;
}
