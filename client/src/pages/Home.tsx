import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpen, CalendarDays, MessageCircle, Newspaper, PenLine, Star } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { Category, Post, ScheduleItem } from '../lib/types';
import { todayISO, hijriDate } from '../lib/dates';
import PostCard from '../components/PostCard';
import ScheduleTable from '../components/ScheduleTable';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';

export default function Home() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [isFallback, setIsFallback] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [catRes, schedRes, todayRes] = await Promise.all([
          api<{ categories: Category[] }>('/categories'),
          api<{ items: ScheduleItem[] }>('/schedule'),
          api<{ items: Post[] }>(`/posts?date=${todayISO()}&limit=12`),
        ]);
        if (!active) return;
        setCategories(catRes.categories);
        setSchedule(schedRes.items);

        if (todayRes.items.length > 0) {
          setPosts(todayRes.items);
          setIsFallback(false);
        } else {
          // Fallback: fetch recent published posts
          const recentRes = await api<{ items: Post[] }>('/posts?limit=12').catch(() => ({ items: [] }));
          if (!active) return;
          setPosts(recentRes.items);
          setIsFallback(recentRes.items.length > 0);
        }
      } catch {
        /* ignore */
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div>
      {/* Hero */}
      <section className="hero-editorial relative overflow-hidden text-white">
        <div className="absolute inset-0 opacity-15 [background-image:radial-gradient(rgba(234,179,8,0.35)_1px,transparent_1px)] [background-size:22px_22px]" />
        <div className="hero-reveal container-site relative grid min-h-[25rem] items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1fr_0.42fr]">
          <div>
            <p className="inline-flex items-center gap-2 border-b border-gold-300/40 pb-2 text-sm font-bold text-gold-200">
              <Star className="h-4 w-4" />
              {hijriDate(todayISO())}
            </p>
            <h1 className="mt-5 max-w-2xl font-display text-4xl font-black leading-[1.2] sm:text-5xl">
              رجال الأمة
              <span className="mt-3 block text-xl font-bold leading-9 text-gold-300 sm:text-2xl">
                مقرّرٌ يبني الإنسان… ومجتمعٌ يقرأ ويتفاعل
              </span>
            </h1>
            <p className="mt-5 max-w-xl leading-8 text-brand-100">
              تابع جدول المقرر الأسبوعي، واستعرض منشورات اليوم من مختلف الأقسام، وشارك
              بتفاعلاتك وتعليقاتك.
            </p>
          </div>
          <div className="hidden border-r border-white/15 py-6 pr-8 lg:block">
            <p className="text-sm font-bold text-gold-200">وجهتك اليومية</p>
            <p className="mt-3 font-display text-3xl font-black leading-tight text-white">
              اقرأ، ناقش، وواصل الطريق.
            </p>
            <p className="mt-3 text-sm leading-7 text-brand-200">كل ما تحتاجه للمقرر في مكان واحد.</p>
          </div>
          <div className="flex flex-wrap gap-3 lg:col-span-2">
            <a href="#schedule" className="btn-gold">
              <CalendarDays className="h-4 w-4" />
              جدول المقرر الأسبوعي
            </a>
            <a href="#postList" className="btn !bg-white/15 text-white hover:!bg-white/25">
              <BookOpen className="h-4 w-4" />
              منشورات اليوم
            </a>
            {user?.role === 'admin' && (
              <Link to="/admin" className="btn !bg-white/10 text-brand-100 hover:!bg-white/20 border border-white/20">
                <PenLine className="h-4 w-4" />
                إدارة المنشورات والجدول
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Weekly schedule */}
      <section id="schedule" className="container-site mt-10">
        <ScheduleTable items={schedule} loading={loading} />
      </section>

      {/* Categories chip bar */}
      {categories.length > 0 && (
        <section className="container-site mt-10">
          <div className="flex flex-wrap items-center gap-2 border-b border-brand-200 dark:border-brand-800 pb-4">
            <span className="ml-1 py-1.5 text-sm font-extrabold text-stone-500 dark:text-stone-400">تصفّح الأقسام</span>
            {categories.map((c) => (
              <Link key={c.id} to={`/category/${c.slug}`} className="chip">
                {c.name}
                <span className="rounded-md bg-white px-1.5 text-[11px] text-brand-500 dark:bg-[#081711] dark:text-gold-300">{c.postCount}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Daily briefing */}
      <section id="postList" className="container-site mt-10">
        <div className="section-heading mb-5 flex items-end justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold-100 text-gold-700 dark:bg-gold-500/10 dark:text-gold-300">
              <BookOpen className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-extrabold text-gold-700 dark:text-gold-400">
                {isFallback ? 'أحدث المنشورات' : 'القراءة اليومية'}
              </p>
              <h2 className="font-display text-2xl font-extrabold text-brand-950 dark:text-stone-100">
                {isFallback ? 'منشورات سابقة للمطالعة' : 'ابدأ من هنا'}
              </h2>
            </div>
          </div>
          <span className="text-sm text-stone-500 dark:text-stone-400">{hijriDate(todayISO())}</span>
        </div>

        {isFallback && (
          <div className="mb-5 rounded-xl border border-brand-200 bg-brand-50/70 px-4 py-2.5 text-xs font-medium text-brand-900 dark:border-brand-800 dark:bg-brand-950/60 dark:text-stone-300">
            لم تُنشر مواد مخصصة لتاريخ اليوم بعد — نعرض لك أحدث المواد المنشورة لمتابعتها والاستفادة منها.
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : posts.length === 0 ? (
          <EmptyState
            icon={Newspaper}
            title="لا توجد منشورات بعد"
            description="لم يُنشر أي محتوى حتى الآن — عد لاحقاً أو أضف أول منشور"
            action={
              user?.role === 'admin' ? (
                <Link to="/admin" className="btn-primary"><PenLine className="h-4 w-4" />إضافة منشور</Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
              <PostCard post={posts[0]} featured />
              <aside className="card card-editorial p-6 dark:border-brand-800/80 dark:bg-[#0d221a]">
                <p className="text-xs font-extrabold text-brand-500 dark:text-gold-400">
                  {isFallback ? 'جولة في المحتوى' : 'خريطة اليوم'}
                </p>
                <h3 className="mt-2 font-display text-xl font-black text-brand-950 dark:text-stone-100">مساحة صغيرة للتركيز</h3>
                <p className="mt-2 text-sm leading-7 text-stone-600 dark:text-stone-300">اقرأ المنشور الأبرز، ثم اختر من بقية الأقسام ما يناسب وقتك.</p>
                <div className="mt-6 grid grid-cols-2 gap-2 border-y border-brand-100 dark:border-brand-800 py-4">
                  <div>
                    <p className="font-display text-2xl font-black text-brand-800 dark:text-gold-300">{posts.length}</p>
                    <p className="text-xs text-stone-500 dark:text-stone-400">{isFallback ? 'منشورات معروضة' : 'منشورات اليوم'}</p>
                  </div>
                  <div>
                    <p className="font-display text-2xl font-black text-brand-800 dark:text-gold-300">{categories.length}</p>
                    <p className="text-xs text-stone-500 dark:text-stone-400">أقسام مفتوحة</p>
                  </div>
                </div>
                <div className="mt-5 space-y-2">
                  <a href="#schedule" className="flex items-center justify-between text-sm font-bold text-brand-700 hover:text-brand-950 dark:text-brand-400 dark:hover:text-gold-300">
                    <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4" />راجع جدول الأسبوع</span><ArrowLeft className="h-4 w-4" />
                  </a>
                  <Link to={`/category/${posts[0].category.slug}`} className="flex items-center justify-between text-sm font-bold text-brand-700 hover:text-brand-950 dark:text-brand-400 dark:hover:text-gold-300">
                    <span className="inline-flex items-center gap-2"><MessageCircle className="h-4 w-4" />استكشف القسم</span><ArrowLeft className="h-4 w-4" />
                  </Link>
                </div>
              </aside>
            </div>
            {posts.length > 1 && (
              <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {posts.slice(1).map((post) => <PostCard key={post.id} post={post} />)}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
