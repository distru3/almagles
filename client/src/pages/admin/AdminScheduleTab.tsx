import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Pencil, X, ChevronRight, ChevronLeft, CalendarDays } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { ScheduleItem } from '../../lib/types';
import {
  WEEKDAY_KEYS,
  WEEKDAY_NAMES,
  weekStart,
  addDays,
  toISODate,
  hijriDate,
  gregorianShort,
  weekdayKey,
  isTodayKey,
  formatWeekLabel,
} from '../../lib/dates';
import Spinner from '../../components/Spinner';

const TIME_LABELS = ['فجر', 'بعد العصر', 'بعد المغرب', 'بعد العشاء'];
const SECTIONS = ['قرآن — تدبر', 'تزكية — الثقافة والسلوك', 'استدراك ومراجعة', 'استدراك وتسميع', ''];

interface ActivityForm {
  id: string | null;
  date: string;
  timeLabel: string;
  section: string;
  title: string;
  notes: string;
  linkUrl: string;
}

function emptyForm(date: string): ActivityForm {
  return { id: null, date, timeLabel: 'فجر', section: '', title: '', notes: '', linkUrl: '' };
}

export default function AdminScheduleTab() {
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [anchor, setAnchor] = useState<Date>(() => weekStart(new Date()));
  const [form, setForm] = useState<ActivityForm | null>(null);

  const load = async () => {
    try {
      const res = await api<{ items: ScheduleItem[] }>('/schedule');
      setItems(res.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر التحميل');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const weekDays = useMemo(
    () =>
      WEEKDAY_KEYS.map((key, i) => {
        const date = addDays(anchor, i);
        return { key, date: toISODate(date) };
      }),
    [anchor],
  );

  const byDate = useMemo(() => {
    const map: Record<string, ScheduleItem[]> = {};
    for (const item of items) {
      (map[item.date] ??= []).push(item);
    }
    return map;
  }, [items]);

  const weekDates = useMemo(() => new Set(weekDays.map((d) => d.date)), [weekDays]);

  const otherWeekDates = useMemo(() => {
    const dates = [...new Set(items.map((i) => i.date))].filter((d) => !weekDates.has(d)).sort((a, b) => b.localeCompare(a));
    return dates.map((date) => ({ date, list: byDate[date] ?? [] }));
  }, [items, weekDates, byDate]);

  const scrollToDay = (date: string) => {
    setTimeout(() => {
      document.getElementById(`day-${date}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  };

  const startNew = (date: string) => {
    setForm(emptyForm(date));
    scrollToDay(date);
  };

  const startEdit = (item: ScheduleItem) => {
    setAnchor(weekStart(new Date(`${item.date}T12:00:00`)));
    setForm({
      id: item.id,
      date: item.date,
      timeLabel: item.timeLabel,
      section: item.section ?? '',
      title: item.title,
      notes: item.notes ?? '',
      linkUrl: item.linkUrl ?? '',
    });
    scrollToDay(item.date);
  };

  const cancelEdit = () => setForm(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !form) return;
    if (!form.date || !form.title.trim()) {
      setError('العنوان مطلوب');
      return;
    }
    setBusy(true);
    setError(null);
    const body = {
      date: form.date,
      weekdayKey: weekdayKey(new Date(`${form.date}T12:00:00`)),
      timeLabel: form.timeLabel.trim(),
      section: form.section.trim() || null,
      title: form.title.trim(),
      notes: form.notes.trim() || null,
      linkUrl: form.linkUrl.trim() || null,
    };
    try {
      if (form.id) {
        await api(`/schedule/${form.id}`, { method: 'PUT', body });
      } else {
        await api('/schedule', { method: 'POST', body });
      }
      setForm(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر الحفظ');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item: ScheduleItem) => {
    if (!window.confirm(`حذف «${item.title}» من الجدول؟`)) return;
    try {
      await api(`/schedule/${item.id}`, { method: 'DELETE' });
      if (form?.id === item.id) setForm(null);
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'تعذّر الحذف');
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-black text-brand-950">الجدول الأسبوعي</h2>
          <p className="text-sm text-stone-500">
            اعرض الأسبوع كاملاً من السبت إلى الجمعة وأضف الأنشطة لكل يوم
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-xl border border-brand-100 bg-white px-3 py-2">
          <CalendarDays className="h-4 w-4 text-brand-600" />
          <span className="text-sm font-extrabold text-brand-900">
            {formatWeekLabel(anchor)} — {formatWeekLabel(addDays(anchor, 6))}
          </span>
          <button onClick={() => setAnchor((a) => addDays(a, -7))} className="btn !px-2 !py-1" aria-label="الأسبوع السابق">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => setAnchor(weekStart(new Date()))}
            className="btn !px-2.5 !py-1 text-xs"
            aria-label="الأسبوع الحالي"
          >
            الأسبوع الحالي
          </button>
          <button onClick={() => setAnchor((a) => addDays(a, 7))} className="btn !px-2 !py-1" aria-label="الأسبوع التالي">
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="mt-5 space-y-3">
            {weekDays.map((day) => {
              const activities = byDate[day.date] ?? [];
              const isToday = isTodayKey(day.date);
              const formOpen = form?.date === day.date;
              return (
                <div key={day.date} id={`day-${day.date}`} className="card overflow-hidden">
                  <div
                    className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 ${
                      isToday ? 'border-gold-300 bg-gold-100/60' : 'border-brand-100 bg-brand-50/60'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <span
                        className={`font-display text-sm font-black ${
                          isToday ? 'text-gold-700' : 'text-brand-900'
                        }`}
                      >
                        {WEEKDAY_NAMES[day.key]}
                      </span>
                      <span className="text-xs font-semibold text-stone-600">{gregorianShort(day.date)}</span>
                      <span className="text-xs font-bold text-brand-600">{hijriDate(day.date)}</span>
                      {isToday && (
                        <span className="rounded-full bg-gold-400 px-2 py-px text-[10px] font-extrabold text-brand-950">
                          اليوم
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-stone-400">{activities.length} نشاط</span>
                      {!formOpen && (
                        <button onClick={() => startNew(day.date)} className="btn-outline !px-2.5 !py-1" aria-label={`إضافة نشاط ${WEEKDAY_NAMES[day.key]}`}>
                          <Plus className="h-3.5 w-3.5" />
                          نشاط
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 p-3">
                    {activities.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-100 bg-white p-3"
                      >
                        <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-extrabold text-brand-700">
                          {item.timeLabel}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-extrabold text-brand-950">{item.title}</p>
                          {(item.section || item.notes) && (
                            <p className="truncate text-xs text-stone-500">
                              {[item.section, item.notes].filter(Boolean).join(' — ')}
                            </p>
                          )}
                          {item.linkUrl && (
                            <a
                              href={item.linkUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-0.5 block truncate text-xs font-bold text-brand-600 underline underline-offset-2"
                            >
                              فتح الرابط
                            </a>
                          )}
                        </div>
                        <div className="flex gap-1.5">
                          <button onClick={() => startEdit(item)} className="btn-outline !px-2.5 !py-1.5" aria-label="تعديل">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => remove(item)} className="btn-danger !px-2.5 !py-1.5" aria-label="حذف">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}

                    {dayForm(day.date)}
                  </div>
                </div>
              );
            })}
          </div>

          {otherWeekDates.length > 0 && (
            <div className="mt-8">
              <h3 className="font-display text-sm font-black text-brand-900">أسابيع أخرى</h3>
              <div className="mt-2 space-y-2">
                {otherWeekDates.map(({ date, list }) => (
                  <div key={date} className="card overflow-hidden">
                    <div className="flex items-center gap-2 border-b border-brand-100 bg-brand-50/60 px-4 py-2">
                      <CalendarDays className="h-4 w-4 text-brand-600" />
                      <p className="font-extrabold text-brand-900">{gregorianShort(date)}</p>
                      <span className="text-xs font-bold text-brand-600">{hijriDate(date)}</span>
                      <span className="text-xs text-stone-400">{list.length} نشاط</span>
                    </div>
                    <div className="divide-y divide-brand-50">
                      {list.map((item) => (
                        <div key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                          <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-extrabold text-brand-700">
                            {item.timeLabel}
                          </span>
                          <p className="min-w-0 flex-1 font-extrabold text-brand-950">{item.title}</p>
                          <div className="flex gap-1.5">
                            <button onClick={() => startEdit(item)} className="btn-outline !px-2.5 !py-1.5" aria-label="تعديل">
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button onClick={() => remove(item)} className="btn-danger !px-2.5 !py-1.5" aria-label="حذف">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  function dayForm(date: string) {
    if (form?.date === date) {
      return (
        <form onSubmit={save} className="rounded-xl border-2 border-dashed border-brand-200 bg-brand-50/40 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="label">وقت النشاط</label>
              <select
                className="input !py-2 text-sm"
                value={form.timeLabel}
                onChange={(e) => setForm({ ...form, timeLabel: e.target.value })}
              >
                {TIME_LABELS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">عنوان النشاط</label>
              <input
                className="input !py-2 text-sm"
                placeholder="مثال: تدبر سورة الأنعام"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                maxLength={200}
                autoFocus
                required
              />
            </div>
            <div>
              <label className="label">القسم (اختياري)</label>
              <input
                className="input !py-2 text-sm"
                list="schedule-sections"
                placeholder="مثال: قرآن — تدبر"
                value={form.section}
                onChange={(e) => setForm({ ...form, section: e.target.value })}
                maxLength={100}
              />
              <datalist id="schedule-sections">
                {SECTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="label">الملاحظات (اختياري)</label>
              <input
                className="input !py-2 text-sm"
                placeholder="مثال: الآيات ١٩ - ٢٠"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                maxLength={2000}
              />
            </div>
            <div>
              <label className="label">الرابط (اختياري)</label>
              <input
                className="input !py-2 text-sm"
                dir="ltr"
                placeholder="https://…"
                value={form.linkUrl}
                onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
                maxLength={500}
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="submit" className="btn-primary !py-2 text-sm" disabled={busy}>
              <Plus className="h-4 w-4" />
              {form.id ? 'حفظ التعديل' : 'إضافة النشاط'}
            </button>
            <button type="button" onClick={cancelEdit} className="btn-outline !py-2 text-sm">
              <X className="h-4 w-4" />
              إلغاء
            </button>
          </div>
        </form>
      );
    }
    return null;
  }
}