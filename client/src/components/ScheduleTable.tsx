import { useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft, CalendarX2, CalendarDays } from 'lucide-react';
import type { ScheduleItem } from '../lib/types';
import { WEEKDAY_KEYS, WEEKDAY_NAMES, weekStart, addDays, toISODate, hijriDate, gregorianShort, formatWeekLabel, isTodayKey } from '../lib/dates';

interface Props {
  items: ScheduleItem[];
  loading?: boolean;
}

export default function ScheduleTable({ items, loading }: Props) {
  const [anchor, setAnchor] = useState<Date>(() => weekStart(new Date()));

  const weekDays = useMemo(() => {
    return WEEKDAY_KEYS.map((key, i) => {
      const date = addDays(anchor, i);
      return { key, date: toISODate(date), dayNum: date.getDate() };
    });
  }, [anchor]);

  const byDate = useMemo(() => {
    const map: Record<string, ScheduleItem[]> = {};
    for (const item of items) {
      (map[item.date] ??= []).push(item);
    }
    return map;
  }, [items]);

  const hasActivities = weekDays.some((d) => (byDate[d.date] ?? []).length > 0);

  const goPrev = () => setAnchor((a) => addDays(a, -7));
  const goNext = () => setAnchor((a) => addDays(a, 7));

  return (
    <section className="schedule-shell overflow-hidden">
      <div className="schedule-header flex flex-wrap items-center justify-between gap-3 border-b border-brand-100 px-5 py-4">
        <div className="flex items-center gap-2 text-white">
          <CalendarDays className="h-5 w-5 text-gold-300" />
          <h2 className="font-display text-lg font-extrabold">المقرر الأسبوعي</h2>
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-bold text-gold-200">
            {formatWeekLabel(anchor)} — {formatWeekLabel(addDays(anchor, 6))}
          </span>
        </div>
        <div className="flex gap-1.5">
          <button onClick={goPrev} className="btn !bg-white/10 !px-2.5 !py-1.5 text-white hover:!bg-white/20" aria-label="الأسبوع السابق">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => setAnchor(weekStart(new Date()))}
            className="btn !bg-white/10 !px-3 !py-1.5 text-xs text-white hover:!bg-white/20"
          >
            الأسبوع الحالي
          </button>
          <button onClick={goNext} className="btn !bg-white/10 !px-2.5 !py-1.5 text-white hover:!bg-white/20" aria-label="الأسبوع التالي">
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3 p-5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-brand-50" />
          ))}
        </div>
      ) : !hasActivities ? (
        <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-500">
            <CalendarX2 className="h-6 w-6" />
          </div>
          <p className="text-sm font-bold text-brand-900">لم تُعرض أنشطة هذا الأسبوع بعد</p>
          <p className="max-w-sm text-xs leading-6 text-stone-500">
            سيقوم المشرفون بإضافة أنشطة المقرر قريباً — تابعنا يومياً لمعرفة الجديد
          </p>
        </div>
      ) : (
        /* Desktop: 7-column grid — RTL renders السبت first */
        <div className="hidden grid-cols-7 divide-x divide-x-reverse divide-brand-100 md:grid">
          {weekDays.map((day) => {
            const activities = byDate[day.date] ?? [];
            const today = isTodayKey(day.date);
            return (
              <div key={day.key} className={today ? 'bg-gold-100/60' : 'bg-white'}>
                <div
                  className={`border-b px-3 py-3 text-center ${
                    today ? 'border-gold-300 bg-gold-100' : 'border-brand-100 bg-brand-50/60'
                  }`}
                >
                  <p className={`text-sm font-extrabold ${today ? 'text-gold-700' : 'text-brand-900'}`}>
                    {WEEKDAY_NAMES[day.key]}
                  </p>
                  <p className="text-[11px] font-medium text-stone-500">{gregorianShort(day.date)}</p>
                  <p className="mt-0.5 text-[11px] font-medium text-stone-500">{hijriDate(day.date)}</p>
                  {today && (
                    <span className="mt-1 inline-block rounded-full bg-gold-400 px-2 py-px text-[10px] font-extrabold text-brand-950">
                      اليوم
                    </span>
                  )}
                </div>
                <div className="min-h-[120px] space-y-2 p-2">
                  {activities.length === 0 ? (
                    <p className="px-1 pt-2 text-[11px] text-stone-300">—</p>
                  ) : (
                    activities.map((a) => (
                      <div
                        key={a.id}
                        className="rounded-lg border border-brand-100 bg-white p-2 shadow-sm transition hover:border-gold-300"
                      >
                        {a.timeLabel && (
                          <span className="mb-1 inline-block rounded-full bg-brand-100 px-2 py-px text-[10px] font-extrabold text-brand-700">
                            {a.timeLabel}
                          </span>
                        )}
                        <p className="text-xs font-extrabold leading-5 text-brand-950">{a.title}</p>
                        {a.section && <p className="mt-0.5 text-[11px] font-medium text-stone-500">{a.section}</p>}
                        {a.notes && <p className="mt-1 text-[11px] leading-5 text-stone-500">{a.notes}</p>}
                        {a.linkUrl && (
                          <a
                            href={a.linkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 block text-[11px] font-bold text-brand-600 underline underline-offset-2"
                          >
                            فتح الرابط
                          </a>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Mobile: vertical day list */}
      {!loading && hasActivities && (
        <div className="divide-y divide-brand-100 md:hidden">
          {weekDays.map((day) => {
            const activities = byDate[day.date] ?? [];
            const today = isTodayKey(day.date);
            return (
              <div key={day.key} className={today ? 'bg-gold-100/50' : ''}>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <p className={`font-display text-sm font-extrabold ${today ? 'text-gold-700' : 'text-brand-900'}`}>
                    {WEEKDAY_NAMES[day.key]}
                    {today && (
                      <span className="mr-2 rounded-full bg-gold-400 px-2 py-px text-[10px] font-extrabold text-brand-950">
                        اليوم
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-stone-500">
                    {gregorianShort(day.date)} · {hijriDate(day.date)}
                  </p>
                </div>
                <div className="space-y-2 px-4 pb-4">
                  {activities.length === 0 ? (
                    <p className="text-xs text-stone-400">لا توجد أنشطة</p>
                  ) : (
                    activities.map((a) => (
                      <div key={a.id} className="rounded-xl border border-brand-100 bg-white p-3 shadow-sm">
                        <div className="flex items-center gap-2">
                          {a.timeLabel && (
                            <span className="rounded-full bg-brand-100 px-2 py-px text-[10px] font-extrabold text-brand-700">
                              {a.timeLabel}
                            </span>
                          )}
                          <p className="text-sm font-extrabold text-brand-950">{a.title}</p>
                        </div>
                        {a.section && <p className="mt-1 text-xs font-medium text-stone-500">{a.section}</p>}
                        {a.notes && <p className="mt-1 text-xs leading-6 text-stone-500">{a.notes}</p>}
                        {a.linkUrl && (
                          <a
                            href={a.linkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1.5 inline-block text-xs font-bold text-brand-600 underline underline-offset-2"
                          >
                            فتح الرابط
                          </a>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
