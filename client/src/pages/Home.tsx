import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Newspaper, PenLine } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { Category, Post, ScheduleColumn, ScheduleItem, ScheduleResponse } from '../lib/types';
import { customSummary, linkText } from '../lib/schedule';
import { todayISO, hijriDate, hijriShort, weekStart, addDays, toISODate, weekdayKey, WEEKDAY_NAMES } from '../lib/dates';
import { normalizeUrl, isInternalPath } from '../lib/url';
import PostCard from '../components/PostCard';
import ScheduleTable from '../components/ScheduleTable';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';
import { StarPattern } from '../components/Logo';

const dayName = (iso: string) => WEEKDAY_NAMES[weekdayKey(new Date(`${iso}T12:00:00`))];

/** The hero card: today's sessions, else the next upcoming one. */
function LessonCard({ schedule, columns, loading }: { schedule: ScheduleItem[]; columns: ScheduleColumn[]; loading: boolean }) {
  const today = todayISO();
  const todays = schedule.filter((i) => i.date === today);
  const next = schedule.filter((i) => i.date > today).sort((a, b) => a.date.localeCompare(b.date))[0];
  const items = todays.length > 0 ? todays : next ? [next] : [];
  const lead = items[0];

  return (
    <article className="rounded-sm border border-line border-t-[3px] border-t-accent-fill bg-surface p-6 sm:p-7">
      {loading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : !lead ? (
        <>
          <p className="font-display text-sm text-accent">الدرس القادم</p>
          <p className="mt-2 text-fg-2">لا توجد دروس مجدولة حالياً.</p>
        </>
      ) : (
        <>
          <p className="font-display text-sm text-accent">
            {todays.length > 0
              ? `درس اليوم${lead.timeLabel ? ` · ${lead.timeLabel}` : ''}`
              : `الدرس القادم · ${dayName(lead.date)} ${hijriShort(lead.date)}`}
          </p>
          <h2 className="mt-1.5 font-display text-[28px] font-semibold leading-[1.35] sm:text-[30px]">{lead.title}</h2>
          {lead.section && <p className="mt-1 text-[15px] text-muted">{lead.section}</p>}
          {lead.notes && <p className="mt-1.5 text-fg">{lead.notes}</p>}
          {customSummary(lead, columns) && <p className="mt-1 text-[15px] text-fg-2">{customSummary(lead, columns)}</p>}
          {todays.length > 1 && (
            <ul className="mt-3 space-y-1 border-t border-line pt-3 text-[15px] text-fg-2">
              {todays.slice(1).map((i) => (
                <li key={i.id}>
                  <span className="font-display text-accent">{i.timeLabel}</span> — {i.title}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            {lead.linkUrl ? (
              <a
                href={normalizeUrl(lead.linkUrl)}
                target={isInternalPath(lead.linkUrl) ? undefined : '_blank'}
                rel="noopener noreferrer"
                className="btn-primary"
              >
                <ExternalLink className="h-4 w-4" />
                {lead.linkLabel ? linkText(lead) : 'افتح رابط الدرس'}
              </a>
            ) : (
              <a href="#schedule" className="btn-primary">
                الجدول كاملاً
              </a>
            )}
          </div>
        </>
      )}
    </article>
  );
}

/** Saturday→Friday list of this week's sessions, today marked. */
function WeekTimeline({ schedule }: { schedule: ScheduleItem[] }) {
  const today = todayISO();
  const start = weekStart(new Date(`${today}T12:00:00`));
  const days = Array.from({ length: 7 }, (_, i) => toISODate(addDays(start, i)));

  return (
    <aside id="week" className="min-w-0 flex-[1_1_320px]">
      <h2 className="mb-4 font-display text-[22px] font-semibold">
        الأسبوع <span className="text-sm font-normal text-muted">{hijriShort(days[0])} – {hijriShort(days[6])}</span>
      </h2>
      <ol className="flex flex-col gap-4 border-r border-line-strong pr-[18px] text-[15px]">
        {days.map((iso) => {
          const items = schedule.filter((i) => i.date === iso);
          const isToday = iso === today;
          const isPast = iso < today;
          return (
            <li key={iso} className={`relative ${isPast ? 'text-muted' : 'text-fg'}`}>
              {isToday && (
                <span className="absolute -right-6 top-2.5 h-[11px] w-[11px] rounded-full bg-accent-fill" aria-hidden="true" />
              )}
              <span className={`font-display ${isToday ? 'text-accent' : ''}`}>
                {dayName(iso)} {hijriShort(iso).split(' ')[0]}
                {isToday && ' · اليوم'}
              </span>
              {items.length === 0 ? (
                <span className="text-muted"> — لا جلسات</span>
              ) : isToday ? (
                items.map((i) => (
                  <span key={i.id} className="block">
                    {i.title}
                    {i.timeLabel && ` · ${i.timeLabel}`}
                  </span>
                ))
              ) : (
                <span> — {items.map((i) => i.title).join('، ')}</span>
              )}
            </li>
          );
        })}
      </ol>
      <a href="#schedule" className="mt-5 inline-flex items-center gap-1.5 font-display text-accent hover:text-accent-strong">
        الجدول كاملاً
        <ArrowLeft className="h-4 w-4" />
      </a>
    </aside>
  );
}

export default function Home() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [scheduleColumns, setScheduleColumns] = useState<ScheduleColumn[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [isFallback, setIsFallback] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [catRes, schedRes, todayRes] = await Promise.all([
          api<{ categories: Category[] }>('/categories'),
          api<ScheduleResponse>('/schedule'),
          api<{ items: Post[] }>(`/posts?date=${todayISO()}&limit=12`),
        ]);
        if (!active) return;
        setCategories(catRes.categories);
        setSchedule(schedRes.items);
        setScheduleColumns(schedRes.columns ?? []);

        if (todayRes.items.length > 0) {
          setPosts(todayRes.items);
          setIsFallback(false);
        } else {
          // Nothing dated today: show the most recent posts instead.
          const recentRes = await api<{ items: Post[] }>('/posts?limit=12').catch(() => ({ items: [] }));
          if (!active) return;
          setPosts(recentRes.items);
          setIsFallback(recentRes.items.length > 0);
        }
      } catch {
        /* sections fall back to their empty states */
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const [lead, ...rest] = posts;
  const visibleCategories = useMemo(() => categories.filter((c) => c.postCount > 0), [categories]);

  return (
    <div>
      {/* Hero band */}
      <section className="relative overflow-hidden border-b border-line bg-surface-2 dark:bg-canvas">
        <StarPattern className="opacity-[0.18]" />
        <div className="hero-reveal container-site relative grid items-end gap-8 py-14 sm:py-16 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-7">
            <p className="font-display text-base text-accent">
              {dayName(todayISO())} · {hijriDate(todayISO())}
            </p>
            <h1 className="mt-2.5 font-display text-[44px] font-bold leading-[1.2] sm:text-[64px]">مقرّرٌ يبني الإنسان</h1>
            <p className="mt-2.5 text-[20px] text-fg-2 sm:text-[22px]">ومجتمعٌ يقرأ ويتفاعل</p>
          </div>
          <div className="lg:col-span-5">
            <LessonCard schedule={schedule} columns={scheduleColumns} loading={loading} />
          </div>
        </div>
      </section>

      <div className="container-site flex flex-wrap gap-12 py-14">
        {/* Posts */}
        <section id="postList" className="min-w-0 flex-[999_1_560px]">
          <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-[26px] font-semibold">{isFallback ? 'أحدث المنشورات' : 'منشورات اليوم'}</h2>
            {visibleCategories.length > 0 && (
              <nav aria-label="الأقسام" className="flex flex-wrap gap-2">
                {visibleCategories.map((c) => (
                  <Link key={c.id} to={`/category/${c.slug}`} className="chip !py-1 !text-[13px]">
                    {c.name}
                  </Link>
                ))}
              </nav>
            )}
          </div>

          {isFallback && (
            <p className="mb-6 text-sm text-muted">لم تُنشر مواد لتاريخ اليوم بعد — هذه أحدث المواد المنشورة.</p>
          )}

          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : !lead ? (
            <EmptyState
              icon={Newspaper}
              title="لا توجد منشورات بعد"
              description="لم يُنشر أي محتوى حتى الآن — عد لاحقاً"
              action={
                user?.role === 'admin' ? (
                  <Link to="/admin" className="btn-primary">
                    <PenLine className="h-4 w-4" />
                    إضافة منشور
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <>
              <PostCard post={lead} featured />
              {rest.length > 0 && (
                <div className="mt-8 grid grid-cols-1 gap-x-9 gap-y-8 sm:grid-cols-2">
                  {rest.map((post) => (
                    <PostCard key={post.id} post={post} />
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        <WeekTimeline schedule={schedule} />
      </div>

      {/* Full schedule with week navigation */}
      <section id="schedule" className="container-site scroll-mt-24">
        <ScheduleTable items={schedule} columns={scheduleColumns} loading={loading} />
      </section>
    </div>
  );
}
