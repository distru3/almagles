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
    <section className="overflow-hidden rounded-sm border border-line bg-surface">
      {/* Header: title, Hijri range, week navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <CalendarDays className="h-5 w-5 text-accent" aria-hidden="true" />
            <h2 className="font-display text-[22px] font-semibold">المقرر الأسبوعي</h2>
            {isCurrentWeek && (
              <span className="rounded-full border border-accent/40 px-2.5 py-0.5 font-display text-xs text-accent">الأسبوع الحالي</span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted">{formatHijriWeekRange(anchor, addDays(anchor, 6))}</p>
        </div>

        <div className="flex items-center gap-2">
          {canManage && (
            <Link to="/admin?tab=schedule" className="btn-outline hidden !min-h-10 !px-4 !text-sm sm:inline-flex">
              <Plus className="h-4 w-4" />
              إضافة نشاط
            </Link>
          )}
          <button
            type="button"
            onClick={goPrev}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-line-strong text-fg transition hover:border-accent hover:text-accent"
            aria-label="الأسبوع السابق"
          >
            <ChevronRight className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => {
              setAnchor(weekStart(new Date()));
              setSelectedMobileDate(todayISO());
            }}
            disabled={isCurrentWeek}
            className="h-11 rounded-full border border-line-strong px-4 font-display text-sm text-fg transition hover:border-accent hover:text-accent disabled:cursor-default disabled:opacity-50 disabled:hover:border-line-strong disabled:hover:text-fg"
          >
            اليوم
          </button>
          <button
            type="button"
            onClick={goNext}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-line-strong text-fg transition hover:border-accent hover:text-accent"
            aria-label="الأسبوع التالي"
          >
            <ChevronLeft className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      {/* Today's quick highlight if today has tasks */}
      {isCurrentWeek && todayActivities.length > 0 && (
        <div className="flex items-center justify-between border-b border-accent/40 bg-accent-soft/70 px-5 py-2.5 text-xs text-accent">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-accent-fill animate-pulse" />
            <span className="font-bold">مقرر اليوم ({hijriDate(todayISO())}):</span>
            <span>{todayActivities.length} مادة مجدولة ومتاحة للمتابعة</span>
          </div>
          <button
            type="button"
            onClick={() => setSelectedMobileDate(todayISO())}
            className="font-extrabold text-accent underline underline-offset-2 hover:text-accent md:hidden"
          >
            عرض أنشطة اليوم
          </button>
        </div>
      )}

      {loading ? (
        <div className="animate-pulse space-y-3 p-5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-surface-2/80" />
          ))}
        </div>
      ) : !hasActivities ? (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-accent">
            <CalendarX2 className="h-6 w-6" />
          </div>
          <p className="text-base font-extrabold text-fg">
            لم تُعرض أنشطة هذا الأسبوع بعد
          </p>
          <p className="max-w-md text-xs leading-6 text-muted">
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
          <div className="hidden grid-cols-7 divide-x divide-x-reverse divide-line md:grid">
            {weekDays.map((day) => {
              const activities = byDate[day.date] ?? [];
              const today = isTodayKey(day.date);
              return (
                <div
                  key={day.key}
                  className={`flex flex-col ${
                    today
                      ? 'bg-accent-soft/50'
                      : 'bg-surface'
                  }`}
                >
                  {/* Column Day Header */}
                  <div
                    className={`border-b px-2.5 py-3 text-center transition ${
                      today
                        ? 'border-accent bg-accent-soft/80'
                        : 'border-line/90 bg-surface-2/50'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <p className={`font-display text-sm font-extrabold ${today ? 'text-accent' : 'text-fg'}`}>
                        {WEEKDAY_NAMES[day.key]}
                      </p>
                      {today && (
                        <span className="rounded-full bg-accent-fill px-1.5 py-0.5 text-[9px] font-black text-on-accent shadow-2xs">
                          اليوم
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] font-bold text-fg-2">
                      {day.hijriShortStr}
                    </p>
                    {canManage && (
                      <Link
                        to={`/admin?tab=schedule&date=${day.date}`}
                        className="mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted hover:bg-surface-2 hover:text-fg"
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
                        <span className="text-[11px] font-medium text-muted">
                          لا توجد أنشطة
                        </span>
                      </div>
                    ) : (
                      activities.map((a) => (
                        <div
                          key={a.id}
                          className="group rounded-xl border border-line/90 bg-surface p-2.5 shadow-2xs transition hover:border-accent hover:shadow-sm"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex flex-wrap items-center gap-1">
                              {a.timeLabel && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-accent">
                                  <Clock className="h-2.5 w-2.5" />
                                  {a.timeLabel}
                                </span>
                              )}
                              {a.section && (
                                <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-fg-2">
                                  {a.section}
                                </span>
                              )}
                            </div>
                            {canManage && (
                              <Link
                                to={`/admin?tab=schedule&edit=${a.id}`}
                                className="opacity-0 group-hover:opacity-100 text-muted hover:text-accent transition"
                                title="تعديل في لوحة التحكم"
                              >
                                <Pencil className="h-3 w-3" />
                              </Link>
                            )}
                          </div>
                          <p className="mt-1.5 font-display text-xs font-bold leading-5 text-fg group-hover:text-fg">
                            {a.title}
                          </p>
                          {a.notes && (
                            <p className="mt-1 text-[11px] leading-5 text-muted line-clamp-3">
                              {a.notes}
                            </p>
                          )}
                          {a.linkUrl && (
                            <a
                              href={normalizeUrl(a.linkUrl)}
                              target={isInternalPath(a.linkUrl) ? undefined : '_blank'}
                              rel="noopener noreferrer"
                              className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-line/90 bg-surface-2/70 px-2 py-1 text-[11px] font-bold text-accent hover:bg-surface-2 hover:text-fg transition shadow-2xs"
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
            <div className="flex items-center gap-1.5 overflow-x-auto p-2.5 border-b border-line no-scrollbar bg-surface-2/30">
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
                        ? 'bg-accent-fill text-on-accent shadow-sm font-bold'
                        : isToday
                        ? 'border border-accent bg-accent-soft text-accent'
                        : 'border border-line/80 bg-surface text-fg-2 hover:bg-surface-2'
                    }`}
                  >
                    <span className="text-[11px]">{WEEKDAY_NAMES[day.key]}</span>
                    <span className="text-xs font-black mt-0.5">{day.hijriDay}</span>
                    {isToday && (
                      <span className="text-[9px] mt-0.5 px-1 rounded bg-accent-fill/30 text-accent">
                        اليوم
                      </span>
                    )}
                    {dayActs.length > 0 && !isToday && (
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-accent-fill" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected Day Activities List on Mobile */}
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between text-xs text-muted pb-1 border-b border-line/60">
                <span className="font-bold text-fg">
                  {activeMobileDayInfo ? WEEKDAY_NAMES[activeMobileDayInfo.key] : ''} ({hijriDate(activeMobileDate)})
                </span>
                <div className="flex items-center gap-2">
                  <span>{activeMobileActivities.length} أنشطة</span>
                  {canManage && (
                    <Link
                      to={`/admin?tab=schedule&date=${activeMobileDate}`}
                      className="text-xs font-bold text-accent hover:text-fg underline"
                    >
                      + إضافة نشاط
                    </Link>
                  )}
                </div>
              </div>

              {activeMobileActivities.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted">
                  لا توجد مهام أو أنشطة مقررة لهذا اليوم
                </div>
              ) : (
                activeMobileActivities.map((a) => (
                  <div
                    key={a.id}
                    className="card rounded-2xl border border-line p-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {a.timeLabel && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-xs font-bold text-accent">
                            <Clock className="h-3 w-3" />
                            {a.timeLabel}
                          </span>
                        )}
                        {a.section && (
                          <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs font-semibold text-fg-2">
                            {a.section}
                          </span>
                        )}
                      </div>
                      {canManage && (
                        <Link
                          to={`/admin?tab=schedule&edit=${a.id}`}
                          className="text-muted hover:text-accent p-1"
                          title="تعديل في لوحة التحكم"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Link>
                      )}
                    </div>
                    <h3 className="mt-2 font-display text-sm font-extrabold text-fg">
                      {a.title}
                    </h3>
                    {a.notes && (
                      <p className="mt-1.5 text-xs leading-6 text-fg-2">
                        {a.notes}
                      </p>
                    )}
                    {a.linkUrl && (
                      <a
                        href={normalizeUrl(a.linkUrl)}
                        target={isInternalPath(a.linkUrl) ? undefined : '_blank'}
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-line/90 bg-surface-2/70 px-3 py-1.5 text-xs font-bold text-accent hover:bg-surface-2 hover:text-fg transition shadow-2xs"
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
