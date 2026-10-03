import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus,
  Trash2,
  Pencil,
  X,
  ChevronRight,
  ChevronLeft,
  CalendarDays,
  Link2,
  ExternalLink,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { Post, ScheduleItem } from '../../lib/types';
import {
  WEEKDAY_KEYS,
  WEEKDAY_NAMES,
  weekStart,
  addDays,
  toISODate,
  hijriDate,
  formatHijriWeekRange,
  weekdayKey,
  isTodayKey,
} from '../../lib/dates';
import Spinner from '../../components/Spinner';
import { normalizeUrl } from '../../lib/url';

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
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [showPostPicker, setShowPostPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [anchor, setAnchor] = useState<Date>(() => weekStart(new Date()));
  const [form, setForm] = useState<ActivityForm | null>(null);

  const load = async () => {
    try {
      const [schedRes, postsRes] = await Promise.all([
        api<{ items: ScheduleItem[] }>('/schedule'),
        api<{ items: Post[] }>('/posts?limit=40').catch(() => ({ items: [] })),
      ]);
      setItems(schedRes.items);
      setPosts(postsRes.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر التحميل');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Handle URL deep-linking (?date=... or ?edit=...)
  useEffect(() => {
    const targetDate = searchParams.get('date');
    const editId = searchParams.get('edit');
    if (targetDate && /^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      setAnchor(weekStart(new Date(`${targetDate}T12:00:00`)));
      setForm(emptyForm(targetDate));
      setTimeout(() => {
        document.getElementById(`day-${targetDate}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    } else if (editId && items.length > 0) {
      const itemToEdit = items.find((i) => i.id === editId);
      if (itemToEdit) {
        startEdit(itemToEdit);
      }
    }
  }, [searchParams, items]);

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
    const cleanUrl = normalizeUrl(form.linkUrl);
    const body = {
      date: form.date,
      weekdayKey: weekdayKey(new Date(`${form.date}T12:00:00`)),
      timeLabel: form.timeLabel.trim(),
      section: form.section.trim() || null,
      title: form.title.trim(),
      notes: form.notes.trim() || null,
      linkUrl: cleanUrl || null,
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
          <h2 className="font-display text-xl font-black text-brand-950 dark:text-stone-100">الجدول الأسبوعي</h2>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            اعرض الأسبوع كاملاً من السبت إلى الجمعة وأضف الأنشطة لكل يوم
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-xl border border-brand-100 bg-white px-3 py-2 shadow-2xs dark:border-brand-800 dark:bg-[#0b1c15]">
          <CalendarDays className="h-4 w-4 text-brand-600 dark:text-gold-400" />
          <span className="text-sm font-extrabold text-brand-900 dark:text-gold-300">
            {formatHijriWeekRange(anchor, addDays(anchor, 6))}
          </span>
          <button onClick={() => setAnchor((a) => addDays(a, -7))} className="btn-outline !px-2 !py-1 text-xs" aria-label="الأسبوع السابق">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => setAnchor(weekStart(new Date()))}
            className="btn-outline !px-2.5 !py-1 text-xs"
            aria-label="الأسبوع الحالي"
          >
            الأسبوع الحالي
          </button>
          <button onClick={() => setAnchor((a) => addDays(a, 7))} className="btn-outline !px-2 !py-1 text-xs" aria-label="الأسبوع التالي">
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">{error}</p>}

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
                <div key={day.date} id={`day-${day.date}`} className="card overflow-hidden dark:border-brand-800/80 dark:bg-[#0b1c15]">
                  <div
                    className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 ${
                      isToday
                        ? 'border-gold-300 bg-gold-100/60 dark:border-gold-600/40 dark:bg-gold-950/30'
                        : 'border-brand-100 bg-brand-50/60 dark:border-brand-800/80 dark:bg-[#0e241c]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <span
                        className={`font-display text-sm font-black ${
                          isToday ? 'text-gold-700 dark:text-gold-300' : 'text-brand-900 dark:text-stone-100'
                        }`}
                      >
                        {WEEKDAY_NAMES[day.key]}
                      </span>
                      <span className="text-xs font-bold text-brand-700 dark:text-gold-400">{hijriDate(day.date)}</span>
                      {isToday && (
                        <span className="rounded-full bg-gold-400 px-2 py-px text-[10px] font-extrabold text-brand-950 dark:bg-gold-500 dark:text-brand-950">
                          اليوم
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-stone-400">{activities.length} نشاط</span>
                      {!formOpen && (
                        <button onClick={() => startNew(day.date)} className="btn-outline !px-2.5 !py-1 text-xs" aria-label={`إضافة نشاط ${WEEKDAY_NAMES[day.key]}`}>
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
                        className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-100 bg-white p-3 shadow-2xs dark:border-brand-800/70 dark:bg-[#07160f]"
                      >
                        <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-extrabold text-brand-700 dark:bg-brand-900/80 dark:text-gold-300 dark:border dark:border-brand-800">
                          {item.timeLabel}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-extrabold text-brand-950 dark:text-stone-100">{item.title}</p>
                          {(item.section || item.notes) && (
                            <p className="truncate text-xs text-stone-500 dark:text-stone-400">
                              {[item.section, item.notes].filter(Boolean).join(' — ')}
                            </p>
                          )}
                          {item.linkUrl && (
                            <a
                              href={normalizeUrl(item.linkUrl)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-0.5 inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-800 dark:text-gold-400 dark:hover:text-gold-300 underline underline-offset-2"
                            >
                              <span>فتح الرابط</span>
                              <ExternalLink className="h-3 w-3" />
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
              <h3 className="font-display text-sm font-black text-brand-900 dark:text-stone-100">أسابيع أخرى</h3>
              <div className="mt-2 space-y-2">
                {otherWeekDates.map(({ date, list }) => (
                  <div key={date} className="card overflow-hidden dark:border-brand-800/80 dark:bg-[#0b1c15]">
                    <div className="flex items-center gap-2 border-b border-brand-100 bg-brand-50/60 px-4 py-2 dark:border-brand-800 dark:bg-[#0e241c]">
                      <CalendarDays className="h-4 w-4 text-brand-600 dark:text-gold-400" />
                      <p className="font-extrabold text-brand-900 dark:text-stone-100">{hijriDate(date)}</p>
                      <span className="text-xs text-stone-400">{list.length} نشاط</span>
                    </div>
                    <div className="divide-y divide-brand-50 dark:divide-brand-800/60">
                      {list.map((item) => (
                        <div key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                          <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-extrabold text-brand-700 dark:bg-brand-900/80 dark:text-gold-300 dark:border dark:border-brand-800">
                            {item.timeLabel}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-extrabold text-brand-950 dark:text-stone-100">{item.title}</p>
                            {item.linkUrl && (
                              <a
                                href={normalizeUrl(item.linkUrl)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-0.5 inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-800 dark:text-gold-400 dark:hover:text-gold-300 underline underline-offset-2"
                              >
                                <span>فتح الرابط</span>
                                <ExternalLink className="h-3 w-3" />
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
        <form onSubmit={save} className="rounded-xl border-2 border-dashed border-brand-200 bg-brand-50/40 p-4 dark:border-brand-700/80 dark:bg-[#07160f]">
          <div className="mb-3 flex items-center justify-between border-b border-brand-200/80 pb-2 dark:border-brand-800">
            <span className="text-xs font-extrabold text-brand-900 dark:text-gold-300">
              {form.id ? 'تعديل نشاط' : 'إضافة نشاط جديد'} — {WEEKDAY_NAMES[weekdayKey(new Date(`${date}T12:00:00`))]} ({hijriDate(date)})
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
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

            {/* Link adding to schedule entry */}
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label className="label !mb-0 flex items-center gap-1.5">
                  <Link2 className="h-4 w-4 text-brand-600 dark:text-gold-400" />
                  رابط المادة أو المنشور (اختياري)
                </label>
                {posts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowPostPicker((v) => !v)}
                    className="text-xs font-bold text-brand-600 hover:text-brand-800 dark:text-gold-400 dark:hover:text-gold-300 underline underline-offset-2"
                  >
                    {showPostPicker ? 'إخفاء المنشورات' : '🔗 ربط بمنشور من الموقع'}
                  </button>
                )}
              </div>
              <input
                className="input !py-2 text-sm"
                dir="ltr"
                placeholder="https://... أو رابط المنشور /post/..."
                value={form.linkUrl}
                onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
                maxLength={500}
              />
              <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">
                يمكنك وضع رابط خارجي (يوتيوب، تلغرام، ملف، زوم...) أو النقر على «ربط بمنشور» لاختيار مادة من الموقع تلقائياً.
              </p>

              {showPostPicker && (
                <div className="mt-2.5 max-h-48 overflow-y-auto rounded-xl border border-brand-200 bg-white p-2 text-xs shadow-sm dark:border-brand-800 dark:bg-[#07160f]">
                  <p className="mb-1.5 font-bold text-stone-700 dark:text-stone-300 px-1">
                    انقر على أي منشور لملء العنوان والرابط تلقائياً:
                  </p>
                  <div className="space-y-1">
                    {posts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setForm({
                            ...form,
                            title: form.title.trim() ? form.title : p.title,
                            section: form.section.trim() ? form.section : p.category.name,
                            linkUrl: `/post/${p.id}`,
                          });
                          setShowPostPicker(false);
                        }}
                        className="w-full text-right p-2 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-900/40 flex items-center justify-between gap-2 transition"
                      >
                        <span className="font-semibold text-brand-950 dark:text-stone-100 truncate">{p.title}</span>
                        <span className="shrink-0 text-[10px] rounded bg-brand-100/70 px-1.5 py-0.5 text-brand-800 dark:bg-brand-900 dark:text-gold-300">
                          {p.category.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 flex gap-2">
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