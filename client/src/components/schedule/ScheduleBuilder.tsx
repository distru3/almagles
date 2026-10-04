import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { flushSync } from 'react-dom';
import { ChevronLeft, ChevronRight, Columns3, Copy, Download, FileSpreadsheet, Plus, Trash2, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { ScheduleColumn, ScheduleItem, ScheduleResponse } from '../../lib/types';
import { WEEKDAY_NAMES, weekdayKey, hijriShort, hijriDate, gregorianShort, todayISO } from '../../lib/dates';
import {
  weekKeyOf,
  weekDates,
  shiftWeek,
  rankedValues,
  exportCsv,
  templateCsv,
  parseCsv,
  downloadText,
} from '../../lib/schedule';
import Spinner from '../Spinner';
import SessionRow, { type SessionFields } from './SessionRow';
import PrintWeek from './PrintWeek';

type SaveState = 'idle' | 'saving' | 'saved' | 'exporting' | 'error';

interface Toast {
  message: string;
  undo?: () => void;
}

const toPayload = (f: SessionFields) => ({
  timeLabel: f.timeLabel.trim(),
  section: f.section.trim() || null,
  title: f.title.trim(),
  notes: f.notes.trim() || null,
  linkUrl: f.linkUrl.trim() || null,
  linkLabel: f.linkUrl.trim() ? f.linkLabel.trim() || null : null,
  customValues: f.customValues,
});

/** Fields needed to recreate a deleted session (undo). */
const restorable = (i: ScheduleItem) => ({
  date: i.date,
  timeLabel: i.timeLabel,
  section: i.section,
  title: i.title,
  notes: i.notes,
  linkUrl: i.linkUrl,
  linkLabel: i.linkLabel,
  customValues: i.customValues,
  sortOrder: i.sortOrder,
});

const sortItems = (list: ScheduleItem[]) =>
  [...list].sort((a, b) => a.date.localeCompare(b.date) || a.sortOrder - b.sortOrder);

const toolButton =
  'inline-flex h-10 items-center gap-1.5 rounded-full border border-line-strong px-4 font-display text-sm text-fg transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50';

export default function ScheduleBuilder() {
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [columns, setColumns] = useState<ScheduleColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [week, setWeek] = useState(() => weekKeyOf(searchParams.get('date') ?? todayISO()));
  const [drafts, setDrafts] = useState<{ key: number; date: string }[]>([]);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [csvMenu, setCsvMenu] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [printWeeks, setPrintWeeks] = useState<string[]>([]);
  const printRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number>();
  const draftKey = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await api<ScheduleResponse>('/schedule');
      setItems(sortItems(res.items));
      setColumns(res.columns);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'تعذّر تحميل الجدول');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A deep link to one session opens its week.
  useEffect(() => {
    const target = editId && items.find((i) => i.id === editId);
    if (target) setWeek(weekKeyOf(target.date));
  }, [editId, items]);

  const showToast = (t: Toast) => {
    window.clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = window.setTimeout(() => setToast(null), t.undo ? 7000 : 4000);
  };

  /** Wraps every write so the header shows saving / saved / failed. */
  const track = async <T,>(work: () => Promise<T>): Promise<T | null> => {
    setSaveState('saving');
    try {
      const out = await work();
      setSaveState('saved');
      setSaveError(null);
      return out;
    } catch (err) {
      setSaveState('error');
      setSaveError(err instanceof ApiError ? err.message : 'تعذّر الحفظ');
      return null;
    }
  };

  const days = weekDates(week);
  const today = todayISO();
  const weekItems = items.filter((i) => i.date >= days[0] && i.date <= days[6]);
  const weeksWithItems = useMemo(() => [...new Set(items.map((i) => weekKeyOf(i.date)))].sort(), [items]);
  const isCurrentWeek = week === weekKeyOf(today);

  const suggestions = useMemo(
    () => ({
      time: rankedValues(items.map((i) => i.timeLabel)),
      section: rankedValues(items.map((i) => i.section)),
      title: rankedValues(items.map((i) => i.title)),
      columns: Object.fromEntries(columns.map((c) => [c.id, rankedValues(items.map((i) => i.customValues?.[c.id]))])),
    }),
    [items, columns],
  );

  const gridTemplate = [
    '110px',
    '150px',
    'minmax(150px,1.2fr)',
    'minmax(150px,1.5fr)',
    ...columns.map(() => '120px'),
    '140px',
    '88px',
  ].join(' ');

  // ------------------------------------------------------------ session actions

  const saveSession = async (item: ScheduleItem, fields: SessionFields) => {
    const res = await track(() => api<{ item: ScheduleItem }>(`/schedule/${item.id}`, { method: 'PUT', body: toPayload(fields) }));
    if (!res) return false;
    setItems((prev) => prev.map((i) => (i.id === item.id ? res.item : i)));
    return true;
  };

  const createSession = async (draft: { key: number; date: string }, fields: SessionFields) => {
    const res = await track(() =>
      api<{ item: ScheduleItem }>('/schedule', { method: 'POST', body: { date: draft.date, ...toPayload(fields) } }),
    );
    if (!res) return false;
    setDrafts((prev) => prev.filter((d) => d.key !== draft.key));
    setItems((prev) => sortItems([...prev, res.item]));
    return true;
  };

  const moveSession = async (item: ScheduleItem, date: string) => {
    if (date === item.date) return;
    const res = await track(() => api<{ item: ScheduleItem }>(`/schedule/${item.id}`, { method: 'PUT', body: { date } }));
    if (res) setItems((prev) => sortItems(prev.map((i) => (i.id === item.id ? res.item : i))));
  };

  const restore = async (deleted: ScheduleItem[]) => {
    const res = await track(() =>
      api<{ items: ScheduleItem[] }>('/schedule/bulk', { method: 'POST', body: { items: deleted.map(restorable) } }),
    );
    if (res) {
      setItems((prev) => sortItems([...prev, ...res.items]));
      setToast(null);
    }
  };

  const deleteSession = async (item: ScheduleItem) => {
    const ok = await track(() => api(`/schedule/${item.id}`, { method: 'DELETE' }));
    if (ok === null) return;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    showToast({ message: `حُذفت جلسة «${item.title}»`, undo: () => restore([item]) });
  };

  // ------------------------------------------------------------ week actions

  const goToNewWeek = () => {
    const last = weeksWithItems.at(-1);
    setWeek(last && last >= week ? shiftWeek(last, 1) : shiftWeek(week, 1));
  };

  const copyPreviousWeek = async () => {
    if (weekItems.length > 0 && !window.confirm('هذا الأسبوع يحتوي على جلسات — ستُضاف الجلسات المنسوخة إليها. متابعة؟')) return;
    const res = await track(() =>
      api<{ from: string; items: ScheduleItem[] }>('/schedule/copy-week', { method: 'POST', body: { to: week } }),
    );
    if (!res) return;
    setItems((prev) => sortItems([...prev, ...res.items]));
    showToast({ message: `نُسخت ${res.items.length} جلسة من أسبوع ${hijriShort(res.from)} (بدون الملاحظات)` });
  };

  const deleteWeek = async () => {
    if (weekItems.length === 0) return;
    if (!window.confirm(`حذف جميع جلسات هذا الأسبوع (${weekItems.length})؟`)) return;
    const removed = weekItems;
    const ok = await track(() => api(`/schedule/week/${week}`, { method: 'DELETE' }));
    if (ok === null) return;
    setItems((prev) => prev.filter((i) => !removed.some((r) => r.id === i.id)));
    showToast({ message: `حُذف الأسبوع (${removed.length} جلسة)`, undo: () => restore(removed) });
  };

  // ------------------------------------------------------------ columns

  const addColumn = async (label: string) => {
    const res = await track(() => api<{ column: ScheduleColumn }>('/schedule/columns', { method: 'POST', body: { label } }));
    if (res) setColumns((prev) => [...prev, res.column]);
  };
  const renameColumn = async (column: ScheduleColumn, label: string) => {
    if (!label.trim() || label === column.label) return;
    const res = await track(() =>
      api<{ column: ScheduleColumn }>(`/schedule/columns/${column.id}`, { method: 'PUT', body: { label } }),
    );
    if (res) setColumns((prev) => prev.map((c) => (c.id === column.id ? res.column : c)));
  };
  const removeColumn = async (column: ScheduleColumn) => {
    if (!window.confirm(`حذف عمود «${column.label}» وقيمه من جميع الجلسات؟`)) return;
    const ok = await track(() => api(`/schedule/columns/${column.id}`, { method: 'DELETE' }));
    if (ok === null) return;
    setColumns((prev) => prev.filter((c) => c.id !== column.id));
    setItems((prev) =>
      prev.map((i) => {
        if (!(column.id in (i.customValues ?? {}))) return i;
        const { [column.id]: _removed, ...rest } = i.customValues;
        return { ...i, customValues: rest };
      }),
    );
  };

  // ------------------------------------------------------------ CSV

  const exportWeekCsv = (all: boolean) => {
    setCsvMenu(false);
    const list = all ? items : weekItems;
    downloadText(exportCsv(list, columns), all ? 'الجدول_كاملاً.csv' : `الجدول_${week}.csv`);
  };

  const importCsv = async (file: File) => {
    setCsvMenu(false);
    try {
      const parsed = parseCsv(await file.text());
      if (parsed.rows.length === 0) {
        showToast({ message: 'لا توجد جلسات صالحة في الملف' });
        return;
      }
      // Unknown column labels become new custom columns.
      let cols = columns;
      for (const label of parsed.customLabels) {
        if (!cols.some((c) => c.label === label)) {
          const res = await api<{ column: ScheduleColumn }>('/schedule/columns', { method: 'POST', body: { label } });
          cols = [...cols, res.column];
        }
      }
      setColumns(cols);
      const byLabel = new Map(cols.map((c) => [c.label, c.id]));
      const res = await track(() =>
        api<{ items: ScheduleItem[] }>('/schedule/bulk', {
          method: 'POST',
          body: {
            items: parsed.rows.map((r) => ({
              date: r.date,
              timeLabel: r.timeLabel,
              section: r.section || null,
              title: r.title,
              notes: r.notes || null,
              linkUrl: r.linkUrl || null,
              customValues: Object.fromEntries(Object.entries(r.custom).map(([label, v]) => [byLabel.get(label)!, v])),
            })),
          },
        }),
      );
      if (!res) return;
      setItems((prev) => sortItems([...prev, ...res.items]));
      setWeek(weekKeyOf(res.items[0].date));
      const skippedNote = parsed.skipped.length ? ` — تُجوهل ${parsed.skipped.length} سطر (الأسطر: ${parsed.skipped.map((s) => s.line).join('، ')})` : '';
      showToast({ message: `استُورد ${res.items.length} جلسة${skippedNote}` });
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'تعذّر قراءة الملف' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // ------------------------------------------------------------ PDF

  const exportPdf = async (weekKeys: string[]) => {
    if (weekKeys.length === 0) return;
    setPdfOpen(false);
    flushSync(() => setPrintWeeks(weekKeys));
    setSaveState('exporting');
    try {
      const { exportWeeksPdf } = await import('../../lib/schedulePdf');
      const nodes = Array.from(printRef.current?.querySelectorAll<HTMLElement>('[data-print-week]') ?? []);
      await exportWeeksPdf(nodes, weekKeys.length === 1 ? `الجدول_${weekKeys[0]}.pdf` : 'الجدول.pdf');
      setSaveState('idle');
    } catch {
      setSaveState('error');
      setSaveError('تعذّر إنشاء ملف PDF');
    } finally {
      setPrintWeeks([]);
    }
  };

  // ------------------------------------------------------------ render

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (loadError) {
    return <p className="rounded border border-danger/40 bg-danger-soft px-4 py-3 text-danger">{loadError}</p>;
  }

  return (
    <div>
      {/* Typing suggestions from earlier sessions, most used first. */}
      <datalist id="sched-time">{suggestions.time.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="sched-section">{suggestions.section.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="sched-title">{suggestions.title.map((v) => <option key={v} value={v} />)}</datalist>
      {columns.map((c) => (
        <datalist key={c.id} id={`sched-col-${c.id}`}>
          {suggestions.columns[c.id]?.map((v) => <option key={v} value={v} />)}
        </datalist>
      ))}

      {/* Week header */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-display text-sm text-accent">{isCurrentWeek ? 'هذا الأسبوع' : 'الأسبوع'}</p>
          <h2 className="font-display text-[28px] font-semibold leading-tight sm:text-[32px]">
            {hijriShort(days[0])} – {hijriDate(days[6])}
          </h2>
          <p className="text-sm text-muted">
            {gregorianShort(days[0])} – {gregorianShort(days[6])} · {weekItems.length} جلسة
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SaveStatus state={saveState} error={saveError} />
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setWeek(shiftWeek(week, -1))} aria-label="الأسبوع السابق" className="flex h-11 w-11 items-center justify-center rounded-full border border-line-strong hover:border-accent hover:text-accent">
              <ChevronRight className="h-[18px] w-[18px]" />
            </button>
            <button type="button" onClick={() => setWeek(weekKeyOf(today))} disabled={isCurrentWeek} className="h-11 rounded-full border border-line-strong px-4 font-display text-sm hover:border-accent hover:text-accent disabled:opacity-50">
              اليوم
            </button>
            <button type="button" onClick={() => setWeek(shiftWeek(week, 1))} aria-label="الأسبوع التالي" className="flex h-11 w-11 items-center justify-center rounded-full border border-line-strong hover:border-accent hover:text-accent">
              <ChevronLeft className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div role="toolbar" aria-label="أدوات الجدول" className="mb-5 flex flex-wrap gap-2 rounded border border-line bg-surface p-2.5">
        <button type="button" onClick={goToNewWeek} className="btn-primary !min-h-10 !px-4 !text-sm">
          <Plus className="h-4 w-4" />
          أسبوع جديد
        </button>
        <button type="button" onClick={copyPreviousWeek} className={toolButton} disabled={weeksWithItems.every((w) => w >= week)}>
          <Copy className="h-4 w-4" />
          نسخ الأسبوع السابق
        </button>
        <button type="button" onClick={() => setPdfOpen(true)} className={toolButton} disabled={items.length === 0}>
          <Download className="h-4 w-4" />
          تنزيل PDF
        </button>
        <button type="button" onClick={() => setColumnsOpen(true)} className={toolButton}>
          <Columns3 className="h-4 w-4" />
          الأعمدة المخصصة
        </button>
        <div className="relative">
          <button type="button" onClick={() => setCsvMenu((o) => !o)} className={toolButton} aria-haspopup="menu" aria-expanded={csvMenu}>
            <FileSpreadsheet className="h-4 w-4" />
            CSV
          </button>
          {csvMenu && (
            <div role="menu" className="absolute right-0 top-11 z-20 w-56 rounded border border-line bg-surface p-1 shadow-lg">
              <button role="menuitem" type="button" className="block w-full rounded px-3 py-2 text-right hover:bg-surface-2" onClick={() => exportWeekCsv(false)}>تصدير هذا الأسبوع</button>
              <button role="menuitem" type="button" className="block w-full rounded px-3 py-2 text-right hover:bg-surface-2" onClick={() => exportWeekCsv(true)}>تصدير الجدول كاملاً</button>
              <button role="menuitem" type="button" className="block w-full rounded px-3 py-2 text-right hover:bg-surface-2" onClick={() => fileRef.current?.click()}>استيراد ملف CSV…</button>
              <button role="menuitem" type="button" className="block w-full rounded px-3 py-2 text-right hover:bg-surface-2" onClick={() => { setCsvMenu(false); downloadText(templateCsv(columns), 'قالب_الجدول.csv'); }}>تنزيل قالب فارغ</button>
            </div>
          )}
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
        </div>
        <span className="flex-1" />
        <button type="button" onClick={deleteWeek} disabled={weekItems.length === 0} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-danger/40 px-4 font-display text-sm text-danger hover:border-danger disabled:opacity-40">
          <Trash2 className="h-4 w-4" />
          حذف الأسبوع
        </button>
      </div>

      {/* Column headings (desktop) */}
      <div className="overflow-x-auto">
        {/* Fixed minimum only on desktop, where every field sits on one line; phones stack them. */}
        <div
          className="md:min-w-[var(--builder-min)]"
          style={{ '--builder-min': `${760 + columns.length * 120}px` } as React.CSSProperties}
        >
          <div
            className="hidden gap-2 px-4 pb-1.5 font-display text-[13px] text-muted md:grid"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <span>الوقت</span>
            <span>القسم</span>
            <span>العنوان</span>
            <span>ملاحظات</span>
            {columns.map((c) => (
              <span key={c.id}>{c.label}</span>
            ))}
            <span>الرابط</span>
            <span />
          </div>

          {days.map((iso) => {
            const dayItems = weekItems.filter((i) => i.date === iso);
            const dayDrafts = drafts.filter((d) => d.date === iso);
            const isToday = iso === today;
            return (
              <section
                key={iso}
                aria-label={WEEKDAY_NAMES[weekdayKey(new Date(`${iso}T12:00:00`))]}
                className={`mb-3 rounded border bg-surface ${isToday ? 'border-accent-fill border-t-[3px]' : 'border-line'}`}
              >
                <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                  <h3 className="font-display text-[17px] font-semibold">
                    {WEEKDAY_NAMES[weekdayKey(new Date(`${iso}T12:00:00`))]}{' '}
                    <span className="text-sm font-normal text-muted">
                      {hijriShort(iso)} · {gregorianShort(iso)}
                    </span>
                    {isToday && <span className="text-sm text-accent"> · اليوم</span>}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setDrafts((prev) => [...prev, { key: ++draftKey.current, date: iso }])}
                    className="inline-flex h-9 items-center gap-1 rounded-full border border-dashed border-accent px-3 font-display text-sm text-accent hover:bg-accent-soft"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    جلسة
                  </button>
                </div>
                {dayItems.length === 0 && dayDrafts.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted">لا توجد جلسات</p>
                ) : (
                  <>
                    {dayItems.map((item) => (
                      <SessionRow
                        key={item.id}
                        item={item}
                        date={iso}
                        columns={columns}
                        weekDays={days}
                        gridTemplate={gridTemplate}
                        highlighted={item.id === editId}
                        onSave={(f) => saveSession(item, f)}
                        onMove={(d) => moveSession(item, d)}
                        onDelete={() => deleteSession(item)}
                      />
                    ))}
                    {dayDrafts.map((draft) => (
                      <SessionRow
                        key={`draft-${draft.key}`}
                        date={iso}
                        columns={columns}
                        weekDays={days}
                        gridTemplate={gridTemplate}
                        onSave={(f) => createSession(draft, f)}
                        onMove={() => undefined}
                        onDelete={() => setDrafts((prev) => prev.filter((d) => d.key !== draft.key))}
                      />
                    ))}
                  </>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {columnsOpen && (
        <ColumnsDialog
          columns={columns}
          onAdd={addColumn}
          onRename={renameColumn}
          onRemove={removeColumn}
          onClose={() => setColumnsOpen(false)}
        />
      )}
      {pdfOpen && (
        <PdfDialog weeks={weeksWithItems} current={week} onExport={exportPdf} onClose={() => setPdfOpen(false)} />
      )}

      {/* Off-screen print layouts, rendered only while a PDF is being made. */}
      <div ref={printRef} aria-hidden="true" className="pointer-events-none fixed -left-[20000px] top-0">
        {printWeeks.map((w) => (
          <div key={w} data-print-week>
            <PrintWeek weekKey={w} columns={columns} items={items.filter((i) => weekKeyOf(i.date) === w)} />
          </div>
        ))}
      </div>

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-full bg-fg py-2 pl-2 pr-5 text-sm text-canvas shadow-xl">
          <span>{toast.message}</span>
          {toast.undo ? (
            <button type="button" onClick={toast.undo} className="h-9 rounded-full bg-accent-fill px-4 font-display font-semibold text-on-accent">
              تراجع
            </button>
          ) : (
            <button type="button" onClick={() => setToast(null)} aria-label="إغلاق" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-canvas/10">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SaveStatus({ state, error }: { state: SaveState; error: string | null }) {
  if (state === 'idle') return null;
  const text =
    state === 'saving'
      ? 'جارٍ الحفظ…'
      : state === 'exporting'
        ? 'جارٍ إنشاء ملف PDF… (أبقِ هذه الصفحة مفتوحة)'
        : state === 'saved'
          ? 'حُفظ تلقائياً'
          : error ?? 'تعذّر الحفظ';
  const tone = state === 'error' ? 'text-danger' : state === 'saved' ? 'text-success' : 'text-muted';
  return (
    <span role="status" className={`inline-flex items-center gap-2 text-sm ${tone}`}>
      <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
      {text}
    </span>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded border border-line bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-xl font-semibold">{title}</h3>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface-2">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ColumnsDialog({
  columns,
  onAdd,
  onRename,
  onRemove,
  onClose,
}: {
  columns: ScheduleColumn[];
  onAdd: (label: string) => Promise<void>;
  onRename: (c: ScheduleColumn, label: string) => Promise<void>;
  onRemove: (c: ScheduleColumn) => Promise<void>;
  onClose: () => void;
}) {
  const [label, setLabel] = useState('');
  return (
    <Dialog title="الأعمدة المخصصة" onClose={onClose}>
      <p className="mb-3 text-sm text-muted">أعمدة إضافية تظهر في كل جلسة، مثل «الشيخ» أو «الكمية».</p>
      <ul className="mb-4 space-y-2">
        {columns.map((c) => (
          <li key={c.id} className="flex gap-2">
            <label className="sr-only" htmlFor={`col-${c.id}`}>اسم العمود</label>
            <input id={`col-${c.id}`} className="input !py-2" defaultValue={c.label} onBlur={(e) => onRename(c, e.target.value.trim())} />
            <button type="button" onClick={() => onRemove(c)} aria-label={`حذف عمود ${c.label}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded border border-line text-danger hover:border-danger">
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
        {columns.length === 0 && <li className="text-sm text-muted">لا توجد أعمدة مخصصة بعد.</li>}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!label.trim()) return;
          await onAdd(label.trim());
          setLabel('');
        }}
      >
        <label className="sr-only" htmlFor="new-column">اسم العمود الجديد</label>
        <input id="new-column" className="input !py-2" placeholder="اسم العمود الجديد" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button type="submit" className="btn-primary shrink-0">إضافة</button>
      </form>
    </Dialog>
  );
}

function PdfDialog({
  weeks,
  current,
  onExport,
  onClose,
}: {
  weeks: string[];
  current: string;
  onExport: (weeks: string[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(weeks.includes(current) ? [current] : weeks.slice(-1)));
  const toggle = (w: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(w)) next.delete(w);
      else next.add(w);
      return next;
    });
  return (
    <Dialog title="تنزيل PDF" onClose={onClose}>
      <p className="mb-2 text-sm text-muted">اختر الأسابيع — كل أسبوع في صفحة مستقلة، والروابط قابلة للنقر.</p>
      <div className="mb-2 flex gap-3 text-sm">
        <button type="button" className="text-accent hover:underline" onClick={() => setSelected(new Set(weeks))}>الكل</button>
        <button type="button" className="text-accent hover:underline" onClick={() => setSelected(new Set())}>لا شيء</button>
      </div>
      <ul className="mb-4 max-h-64 space-y-1 overflow-y-auto">
        {[...weeks].reverse().map((w) => (
          <li key={w}>
            <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded px-2 hover:bg-surface-2">
              <input type="checkbox" checked={selected.has(w)} onChange={() => toggle(w)} className="h-4 w-4 accent-[var(--accent)]" />
              <span>
                {hijriShort(w)} – {hijriShort(weekDates(w)[6])}
                {w === current && <span className="text-accent"> · المعروض</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <button type="button" className="btn-primary w-full" disabled={selected.size === 0} onClick={() => onExport(weeks.filter((w) => selected.has(w)))}>
        <Download className="h-4 w-4" />
        تنزيل ({selected.size})
      </button>
    </Dialog>
  );
}
