import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronRight,
  ChevronLeft,
  CalendarX2,
  CalendarDays,
  Clock,
  ExternalLink,
  Plus,
  Pencil,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { ScheduleItem } from '../lib/types';
import { isInternalPath, normalizeUrl } from '../lib/url';
import {
  WEEKDAY_KEYS,
  WEEKDAY_NAMES,
  weekStart,
  addDays,
  toISODate,
  hijriDate,
  hijriShort,
  hijriDayNumber,
  formatHijriWeekRange,
  isTodayKey,
  todayISO,
} from '../lib/dates';

interface Props {
  items: ScheduleItem[];
  loading?: boolean;
}

export default function ScheduleTable({ items, loading }: Props) {
  const { user } = useAuth();
  const canManage = user?.role === 'admin' || (user?.canManageSchedule ?? false);
  const [anchor, setAnchor] = useState<Date>(() => weekStart(new Date()));
  const [selectedMobileDate, setSelectedMobileDate] = useState<string>(() => todayISO());

  const weekDays = useMemo(() => {
    return WEEKDAY_KEYS.map((key, i) => {
      const date = addDays(anchor, i);
      const iso = toISODate(date);
      return {
        key,
        date: iso,
        hijriDay: hijriDayNumber(iso),
        hijriShortStr: hijriShort(iso),
      };
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
  const isCurrentWeek = toISODate(weekStart(new Date())) === toISODate(anchor);
  const todayActivities = byDate[todayISO()] ?? [];

  const goPrev = () => {
    const prev = addDays(anchor, -7);
    setAnchor(prev);
    setSelectedMobileDate(toISODate(prev));
  };

  const goNext = () => {
    const next = addDays(anchor, 7);
    setAnchor(next);
    setSelectedMobileDate(toISODate(next));
  };

  // Determine active date on mobile if selected date is not in this week
  const activeMobileDate = weekDays.some((d) => d.date === selectedMobileDate)
    ? selectedMobileDate
    : weekDays[0]?.date ?? todayISO();

  const activeMobileActivities = byDate[activeMobileDate] ?? [];
  const activeMobileDayInfo = weekDays.find((d) => d.date === activeMobileDate);

  return (
    <section className="schedule-shell overflow-hidden">
      {/* Header bar with controls */}
      <div className="schedule-header flex flex-wrap items-center justify-between gap-3 border-b border-brand-100 dark:border-brand-800 px-5 py-4">
        <div className="flex flex-wrap items-center gap-3 text-white">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-gold-300 shadow-2xs">
            <CalendarDays className="h-5 w-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-lg font-extrabold text-white">المقرر الأسبوعي</h2>
              {isCurrentWeek && (
                <span className="rounded-full bg-gold-400/25 px-2.5 py-0.5 text-[10px] font-extrabold text-gold-300 border border-gold-400/30">
                  الأسبوع الحالي
                </span>
              )}
            </div>
            <p className="text-xs text-brand-100/85 mt-0.5">
              {formatHijriWeekRange(anchor, addDays(anchor, 6))}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canManage && (
            <Link
              to="/admin?tab=schedule"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-gold-400/90 hover:bg-gold-300 text-brand-950 px-2.5 py-1 text-xs font-bold transition shadow-xs"
              title="إدارة الأنشطة والروابط في الجدول"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>إضافة نشاط</span>
            </Link>
          )}

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={goPrev}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white transition hover:bg-white/25"
              aria-label="الأسبوع السابق"
              title="الأسبوع السابق"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setAnchor(weekStart(new Date()));
                setSelectedMobileDate(todayISO());
              }}
              disabled={isCurrentWeek}
              className={`rounded-lg px-3 py-1 text-xs font-bold transition ${
                isCurrentWeek
                  ? 'bg-white/10 text-brand-200 opacity-60 cursor-default'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              اليوم
            </button>
            <button
              type="button"
              onClick={goNext}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white transition hover:bg-white/25"
              aria-label="الأسبوع التالي"
              title="الأسبوع التالي"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Today's quick highlight if today has tasks */}
      {isCurrentWeek && todayActivities.length > 0 && (
        <div className="flex items-center justify-between border-b border-gold-300/40 bg-gold-50/70 px-5 py-2.5 text-xs text-gold-950 dark:border-gold-800/60 dark:bg-gold-950/20 dark:text-gold-200">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-gold-500 animate-pulse" />
            <span className="font-bold">مقرر اليوم ({hijriDate(todayISO())}):</span>
            <span>{todayActivities.length} مادة مجدولة ومتاحة للمتابعة</span>
          </div>
          <button
            type="button"
            onClick={() => setSelectedMobileDate(todayISO())}
            className="font-extrabold text-gold-800 underline underline-offset-2 hover:text-gold-950 dark:text-gold-300 md:hidden"
          >
            عرض أنشطة اليوم
          </button>
        </div>
      )}

      {loading ? (
        <div className="animate-pulse space-y-3 p-5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-brand-50/80 dark:bg-[#091b14]" />
          ))}
        </div>
      ) : !hasActivities ? (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-gold-400">
            <CalendarX2 className="h-6 w-6" />
          </div>
          <p className="text-base font-extrabold text-brand-950 dark:text-stone-100">
            لم تُعرض أنشطة هذا الأسبوع بعد
          </p>
          <p className="max-w-md text-xs leading-6 text-stone-500 dark:text-stone-400">
            سيقوم المشرفون بإضافة مهام المقرر قريباً — تابع الجدول يومياً لمعرفة الجديد في كل مادة.
          </p>
          {canManage && (
            <Link to="/admin?tab=schedule" className="btn-primary mt-2 !py-2 text-xs">
              <Plus className="h-4 w-4" />
              إضافة أول نشاط لهذا الأسبوع
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* Desktop: Refined 7-column grid */}
          <div className="hidden grid-cols-7 divide-x divide-x-reverse divide-brand-100 dark:divide-brand-800/80 md:grid">
            {weekDays.map((day) => {
              const activities = byDate[day.date] ?? [];
              const today = isTodayKey(day.date);
              return (
                <div
                  key={day.key}
                  className={`flex flex-col ${
                    today
                      ? 'bg-gold-50/50 dark:bg-gold-950/20'
                      : 'bg-white dark:bg-[#0d221a]'
                  }`}
                >
                  {/* Column Day Header */}
                  <div
                    className={`border-b px-2.5 py-3 text-center transition ${
                      today
                        ? 'border-gold-300 bg-gold-100/80 dark:border-gold-800 dark:bg-gold-950/50'
                        : 'border-brand-100/90 bg-brand-50/50 dark:border-brand-800/70 dark:bg-[#091b14]'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <p className={`font-display text-sm font-extrabold ${today ? 'text-gold-900 dark:text-gold-300' : 'text-brand-950 dark:text-stone-100'}`}>
                        {WEEKDAY_NAMES[day.key]}
                      </p>
                      {today && (
                        <span className="rounded-full bg-gold-500 px-1.5 py-0.5 text-[9px] font-black text-brand-950 shadow-2xs">
                          اليوم
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] font-bold text-stone-600 dark:text-gold-300/90">
                      {day.hijriShortStr}
                    </p>
                    {canManage && (
                      <Link
                        to={`/admin?tab=schedule&date=${day.date}`}
                        className="mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-stone-400 hover:bg-black/5 hover:text-brand-800 dark:hover:bg-white/10 dark:hover:text-gold-300"
                        title={`إضافة نشاط ليوم ${WEEKDAY_NAMES[day.key]}`}
                      >
                        <Plus className="h-2.5 w-2.5" />
                        <span>إضافة</span>
                      </Link>
                    )}
                  </div>

                  {/* Day Activities */}
                  <div className="flex-1 space-y-2.5 p-2 min-h-[140px]">
                    {activities.length === 0 ? (
                      <div className="flex h-full items-center justify-center py-8">
                        <span className="text-[11px] font-medium text-stone-300 dark:text-stone-600">
                          لا توجد أنشطة
                        </span>
                      </div>
                    ) : (
                      activities.map((a) => (
                        <div
                          key={a.id}
                          className="group rounded-xl border border-brand-100/90 bg-white p-2.5 shadow-2xs transition hover:border-gold-400 hover:shadow-sm dark:border-brand-800/80 dark:bg-[#0a1c15] dark:hover:border-gold-500/70"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex flex-wrap items-center gap-1">
                              {a.timeLabel && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-brand-900/70 dark:text-gold-300">
                                  <Clock className="h-2.5 w-2.5" />
                                  {a.timeLabel}
                                </span>
                              )}
                              {a.section && (
                                <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                                  {a.section}
                                </span>
                              )}
                            </div>
                            {canManage && (
                              <Link
                                to={`/admin?tab=schedule&edit=${a.id}`}
                                className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-brand-700 dark:hover:text-gold-300 transition"
                                title="تعديل في لوحة التحكم"
                              >
                                <Pencil className="h-3 w-3" />
                              </Link>
                            )}
                          </div>
                          <p className="mt-1.5 font-display text-xs font-bold leading-5 text-brand-950 group-hover:text-brand-800 dark:text-stone-100 dark:group-hover:text-gold-300">
                            {a.title}
                          </p>
                          {a.notes && (
                            <p className="mt-1 text-[11px] leading-5 text-stone-500 dark:text-stone-400 line-clamp-3">
                              {a.notes}
                            </p>
                          )}
                          {a.linkUrl && (
                            <a
                              href={normalizeUrl(a.linkUrl)}
                              target={isInternalPath(a.linkUrl) ? undefined : '_blank'}
                              rel="noopener noreferrer"
                              className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-brand-200/90 bg-brand-50/70 px-2 py-1 text-[11px] font-bold text-brand-700 hover:bg-brand-100 hover:text-brand-900 dark:border-brand-700/60 dark:bg-brand-900/50 dark:text-gold-300 dark:hover:bg-brand-900 transition shadow-2xs"
                            >
                              <ExternalLink className="h-3 w-3 shrink-0" />
                              <span>رابط المادة</span>
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

          {/* Mobile: Interactive Day-by-Day Selector & Cards */}
          <div className="md:hidden">
            {/* Horizontal Day Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto p-2.5 border-b border-brand-100 dark:border-brand-800 no-scrollbar bg-brand-50/30 dark:bg-[#07160f]">
              {weekDays.map((day) => {
                const isSelected = activeMobileDate === day.date;
                const isToday = isTodayKey(day.date);
                const dayActs = byDate[day.date] ?? [];
                return (
                  <button
                    key={day.key}
                    type="button"
                    onClick={() => setSelectedMobileDate(day.date)}
                    className={`flex flex-col items-center justify-center min-w-[4.4rem] py-2 px-2 rounded-xl text-center transition shrink-0 ${
                      isSelected
                        ? 'bg-brand-700 text-white shadow-sm dark:bg-gold-500 dark:text-brand-950 font-bold'
                        : isToday
                        ? 'border border-gold-400 bg-gold-50 text-gold-900 dark:border-gold-700 dark:bg-gold-950/40 dark:text-gold-300'
                        : 'border border-brand-100/80 bg-white text-stone-600 hover:bg-brand-50 dark:border-brand-800/80 dark:bg-[#0a1c15] dark:text-stone-300'
                    }`}
                  >
                    <span className="text-[11px]">{WEEKDAY_NAMES[day.key]}</span>
                    <span className="text-xs font-black mt-0.5">{day.hijriDay}</span>
                    {isToday && (
                      <span className="text-[9px] mt-0.5 px-1 rounded bg-gold-400/30 text-gold-950 dark:text-gold-200">
                        اليوم
                      </span>
                    )}
                    {dayActs.length > 0 && !isToday && (
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-brand-500 dark:bg-gold-400" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected Day Activities List on Mobile */}
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400 pb-1 border-b border-brand-100/60 dark:border-brand-800/60">
                <span className="font-bold text-brand-900 dark:text-stone-200">
                  {activeMobileDayInfo ? WEEKDAY_NAMES[activeMobileDayInfo.key] : ''} ({hijriDate(activeMobileDate)})
                </span>
                <div className="flex items-center gap-2">
                  <span>{activeMobileActivities.length} أنشطة</span>
                  {canManage && (
                    <Link
                      to={`/admin?tab=schedule&date=${activeMobileDate}`}
                      className="text-xs font-bold text-brand-700 hover:text-brand-950 dark:text-gold-400 underline"
                    >
                      + إضافة نشاط
                    </Link>
                  )}
                </div>
              </div>

              {activeMobileActivities.length === 0 ? (
                <div className="py-8 text-center text-xs text-stone-400 dark:text-stone-500">
                  لا توجد مهام أو أنشطة مقررة لهذا اليوم
                </div>
              ) : (
                activeMobileActivities.map((a) => (
                  <div
                    key={a.id}
                    className="card card-editorial rounded-2xl border border-brand-100 p-4 shadow-sm dark:border-brand-800/80 dark:bg-[#0b1c15]"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {a.timeLabel && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700 dark:bg-brand-900/80 dark:text-gold-300">
                            <Clock className="h-3 w-3" />
                            {a.timeLabel}
                          </span>
                        )}
                        {a.section && (
                          <span className="rounded-md bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                            {a.section}
                          </span>
                        )}
                      </div>
                      {canManage && (
                        <Link
                          to={`/admin?tab=schedule&edit=${a.id}`}
                          className="text-stone-400 hover:text-brand-700 dark:hover:text-gold-300 p-1"
                          title="تعديل في لوحة التحكم"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Link>
                      )}
                    </div>
                    <h3 className="mt-2 font-display text-sm font-extrabold text-brand-950 dark:text-stone-100">
                      {a.title}
                    </h3>
                    {a.notes && (
                      <p className="mt-1.5 text-xs leading-6 text-stone-600 dark:text-stone-400">
                        {a.notes}
                      </p>
                    )}
                    {a.linkUrl && (
                      <a
                        href={normalizeUrl(a.linkUrl)}
                        target={isInternalPath(a.linkUrl) ? undefined : '_blank'}
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-brand-200/90 bg-brand-50/70 px-3 py-1.5 text-xs font-bold text-brand-700 hover:bg-brand-100 hover:text-brand-900 dark:border-brand-700/60 dark:bg-brand-900/50 dark:text-gold-300 dark:hover:bg-brand-900 transition shadow-2xs"
                      >
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        <span>فتح رابط المادة</span>
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
