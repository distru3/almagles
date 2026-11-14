import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarDays, ExternalLink, Newspaper, PenLine } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { Category, CouncilNote, Post, ScheduleColumn, ScheduleItem, ScheduleResponse } from '../lib/types';
import { customSummary, linkText } from '../lib/schedule';
import { todayISO, hijriDate, hijriShort, weekStart, addDays, toISODate, weekdayKey, WEEKDAY_NAMES } from '../lib/dates';
import { normalizeUrl, isInternalPath } from '../lib/url';
import PostCard from '../components/PostCard';
import ScheduleSheet from '../components/ScheduleSheet';
import TaskChecklist from '../components/tasks/TaskChecklist';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';
import Logo, { ArchPattern } from '../components/Logo';
import { CouncilNoteView } from '../components/schedule/CouncilNotes';

const FEED_PAGE_SIZE = 10;

const dayName = (iso: string) => WEEKDAY_NAMES[weekdayKey(new Date(`${iso}T12:00:00`))];

/** Today's sessions, else the next upcoming one. */
function upcoming(schedule: ScheduleItem[]) {
  const today = todayISO();
  const todays = schedule.filter((i) => i.date === today);
  const next = schedule.filter((i) => i.date > today).sort((a, b) => a.date.localeCompare(b.date))[0];
  return { todays, items: todays.length > 0 ? todays : next ? [next] : [] };
}

/** The hero card: today's sessions, else the next upcoming one. */
function LessonCard({
  schedule,
  columns,
  todayNote,
  loading,
  onOpenSchedule,
}: {
  schedule: ScheduleItem[];
  columns: ScheduleColumn[];
  todayNote?: CouncilNote;
  loading: boolean;
  onOpenSchedule: () => void;
}) {
  const { todays, items } = upcoming(schedule);
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
          {/* Today's council note still matters on a day without a lesson. */}
          {todayNote && (
            <div className="mt-4">
              <CouncilNoteView note={todayNote} />
            </div>
          )}
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
          {todayNote && (
            <div className="mt-4">
              <CouncilNoteView note={todayNote} />
            </div>
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
              <button type="button" onClick={onOpenSchedule} className="btn-primary">
                الجدول كاملاً
              </button>
            )}
          </div>
        </>
      )}
    </article>
  );
}

/**
 * Floating pill that keeps the schedule one tap away once the hero has scrolled
 * off, previewing the next session so a glance is often enough.
 */
function ScheduleFab({ schedule, visible, onOpen }: { schedule: ScheduleItem[]; visible: boolean; onOpen: () => void }) {
  const { todays, items } = upcoming(schedule);
  const lead = items[0];
  const when = lead ? (todays.length > 0 ? `اليوم${lead.timeLabel ? ` ${lead.timeLabel}` : ''}` : dayName(lead.date)) : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={lead ? `الجدول — ${when}: ${lead.title}` : 'الجدول'}
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      className={`fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] end-4 z-30 flex max-w-[calc(100vw-2rem)] items-center gap-2.5 rounded-full border border-line bg-surface py-2 pe-4 ps-2 text-start shadow-lg transition duration-300 hover:border-accent sm:end-6 ${
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-6 opacity-0'
      }`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-fill text-on-accent">
        <CalendarDays className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block font-display text-[15px] font-semibold text-fg">الجدول</span>
        {lead && (
          <span className="block max-w-[14rem] truncate text-[13px] text-muted">
            <span className="text-accent">{when}</span> · {lead.title}
          </span>
        )}
      </span>
    </button>
  );
}

/** Saturday→Friday list of this week's sessions, today marked. */
function WeekTimeline({
  schedule,
  onOpenSchedule,
  signedIn,
}: {
  schedule: ScheduleItem[];
  onOpenSchedule: () => void;
  signedIn: boolean;
}) {
  const today = todayISO();
  const start = weekStart(new Date(`${today}T12:00:00`));
  const days = Array.from({ length: 7 }, (_, i) => toISODate(addDays(start, i)));

  return (
    // Sticks beside the feed on wide screens, so the week stays in view however far the reader scrolls.
    <aside id="week" className="min-w-0 flex-[1_1_320px] lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto">
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
      <button
        type="button"
        onClick={onOpenSchedule}
        className="mt-5 inline-flex items-center gap-1.5 font-display text-accent hover:text-accent-strong"
      >
        الجدول كاملاً
        <ArrowLeft className="h-4 w-4" />
      </button>
      {signedIn && (
        <div className="mt-8 border-t border-line pt-6">
          <h2 className="mb-3 font-display text-[22px] font-semibold">مهامي</h2>
          <TaskChecklist compact />
        </div>
      )}
    </aside>
  );
}

export default function Home() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [scheduleColumns, setScheduleColumns] = useState<ScheduleColumn[]>([]);
  const [councilNotes, setCouncilNotes] = useState<CouncilNote[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsTotal, setPostsTotal] = useState(0);
  const [postsPage, setPostsPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const [heroInView, setHeroInView] = useState(true);

  // The schedule lives in a sheet so the endless feed can't bury it. Every link to
  // /#schedule (navbar, footer, notifications with ?date=) opens it.
  const location = useLocation();
  const navigate = useNavigate();
  const scheduleOpen = location.hash === '#schedule' || new URLSearchParams(location.search).has('date');
  const openSchedule = () => navigate({ search: location.search, hash: 'schedule' }, { state: { scheduleSheet: true } });
  const closeSchedule = () => {
    // Opened from this page: step back, so the close button and the browser back button agree.
    if ((location.state as { scheduleSheet?: boolean } | null)?.scheduleSheet) return navigate(-1);
    const params = new URLSearchParams(location.search);
    params.delete('date');
    navigate({ search: params.toString(), hash: '' }, { replace: true });
  };

  // The floating schedule button shows once the hero (with today's lesson) is out of view.
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => setHeroInView(entries[0].isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [catRes, schedRes, postsRes] = await Promise.all([
          api<{ categories: Category[] }>('/categories'),
          api<ScheduleResponse>('/schedule'),
          api<{ items: Post[]; total: number }>(`/posts?page=1&limit=${FEED_PAGE_SIZE}`),
        ]);
        if (!active) return;
        setCategories(catRes.categories);
        setSchedule(schedRes.items);
        setScheduleColumns(schedRes.columns ?? []);
        setCouncilNotes(schedRes.notes ?? []);
        // Newest first by post date, so today's posts lead and older ones follow as the reader scrolls.
        setPosts(postsRes.items);
        setPostsTotal(postsRes.total);
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

  const canPublish = user?.role === 'admin' || user?.role === 'writer';
  const publishHref = user?.role === 'admin' ? '/admin?tab=posts' : '/write';
  const updatePost = (next: Post) => setPosts((prev) => prev.map((p) => (p.id === next.id ? next : p)));
  const hasMore = posts.length < postsTotal;

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setLoadMoreFailed(false);
    try {
      const res = await api<{ items: Post[]; total: number }>(`/posts?page=${postsPage + 1}&limit=${FEED_PAGE_SIZE}`);
      // A post published meanwhile shifts the pages by one, so skip any already shown.
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...res.items.filter((p) => !seen.has(p.id))];
      });
      // An empty page means the list shrank under us: stop instead of asking again.
      setPostsTotal(res.items.length === 0 ? 0 : res.total);
      setPostsPage((n) => n + 1);
    } catch {
      setLoadMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, postsPage]);

  // Load the next page when the end of the feed comes near.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loadMoreFailed) return;
    const observer = new IntersectionObserver((entries) => entries[0].isIntersecting && loadMore(), {
      rootMargin: '600px 0px',
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore, loadMoreFailed]);

  const today = todayISO();
  const todayCount = posts.filter((p) => p.postDate >= today).length;

  const visibleCategories = useMemo(() => categories.filter((c) => c.postCount > 0), [categories]);

  return (
    <div>
      {/* Hero band */}
      <section ref={heroRef} className="relative overflow-hidden border-b border-line bg-surface-2 dark:bg-canvas">
        <ArchPattern className="opacity-[0.16]" />
        {/* Oversized brand mark as a quiet watermark, bleeding off the far edge. */}
        <Logo className="pointer-events-none absolute -bottom-16 -left-24 h-[26rem] w-auto opacity-[0.07] sm:h-[32rem]" />
        <div className="hero-reveal container-site relative grid items-end gap-8 py-14 sm:py-16 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-7">
            <p className="font-display text-base text-accent">
              {dayName(todayISO())} · {hijriDate(todayISO())}
            </p>
            <h1 className="mt-2.5 font-display text-[44px] font-bold leading-[1.2] sm:text-[64px]">مقرّر يبني الإنسان</h1>
            <p className="mt-2.5 text-[20px] text-fg-2 sm:text-[22px]">ومجتمع يقرأ ويتفاعل</p>
          </div>
          <div className="lg:col-span-5">
            <LessonCard
              schedule={schedule}
              columns={scheduleColumns}
              todayNote={councilNotes.find((n) => n.date === todayISO())}
              loading={loading}
              onOpenSchedule={openSchedule}
            />
          </div>
        </div>
      </section>

      <div className="container-site flex flex-wrap gap-12 py-14">
        {/* Posts */}
        <section id="postList" className="min-w-0 max-w-[680px] flex-[999_1_560px]">
          <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-[26px] font-semibold">{todayCount > 0 ? 'منشورات اليوم' : 'أحدث المنشورات'}</h2>
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

          {!loading && todayCount === 0 && posts.length > 0 && (
            <p className="mb-6 text-sm text-muted">لم تُنشر مواد لتاريخ اليوم بعد — هذه أحدث المواد المنشورة.</p>
          )}

          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Compose prompt, like a social feed — writers and admins only. */}
              {canPublish && (
                <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface-2 font-display font-bold text-accent"
                    aria-hidden="true"
                  >
                    {user!.name.trim().charAt(0)}
                  </span>
                  <Link
                    to={publishHref}
                    className="flex min-h-11 flex-1 items-center rounded-full bg-surface-2 px-4 text-muted transition hover:text-fg"
                  >
                    شارك فائدة اليوم…
                  </Link>
                  <Link to={publishHref} className="btn-primary !min-h-10 !px-3" aria-label="منشور جديد">
                    <PenLine className="h-4 w-4" />
                  </Link>
                </div>
              )}
              {posts.length === 0 ? (
                <EmptyState icon={Newspaper} title="لا توجد منشورات بعد" description="لم يُنشر أي محتوى حتى الآن — عد لاحقاً" />
              ) : (
                posts.map((post, i) => (
                  <div key={post.id} className="contents">
                    {/* Divider where today's posts end and earlier ones begin. */}
                    {i === todayCount && todayCount > 0 && (
                      <h3 className="mt-4 flex items-center gap-3 font-display text-[18px] font-semibold text-fg-2">
                        منشورات سابقة
                        <span className="h-px flex-1 bg-line" aria-hidden="true" />
                      </h3>
                    )}
                    <PostCard post={post} onChange={updatePost} />
                  </div>
                ))
              )}
              {hasMore && (
                <div ref={sentinelRef} className="flex justify-center py-6">
                  {loadMoreFailed ? (
                    <button onClick={loadMore} className="btn-outline">
                      تعذّر التحميل — إعادة المحاولة
                    </button>
                  ) : loadingMore ? (
                    <Spinner />
                  ) : (
                    <button onClick={loadMore} className="btn-outline">
                      تحميل المزيد
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        <WeekTimeline schedule={schedule} onOpenSchedule={openSchedule} signedIn={Boolean(user)} />
      </div>

      <ScheduleFab schedule={schedule} visible={!heroInView && !scheduleOpen} onOpen={openSchedule} />

      {/* Full schedule with week navigation, over the page */}
      {scheduleOpen && (
        <ScheduleSheet
          items={schedule}
          columns={scheduleColumns}
          notes={councilNotes}
          loading={loading}
          onClose={closeSchedule}
        />
      )}
    </div>
  );
}
