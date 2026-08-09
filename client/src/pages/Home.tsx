import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, Newspaper, PenLine } from 'lucide-react';
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [catRes, schedRes, postsRes] = await Promise.all([
          api<{ categories: Category[] }>('/categories'),
          api<{ items: ScheduleItem[] }>('/schedule'),
          api<{ items: Post[] }>(`/posts?date=${todayISO()}&limit=12`),
        ]);
        if (!active) return;
        setCategories(catRes.categories);
        setSchedule(schedRes.items);
        setPosts(postsRes.items);
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
      <section className="relative overflow-hidden bg-brand-900 text-white">
        <div className="absolute inset-0 opacity-15 [background-image:radial-gradient(rgba(234,179,8,0.35)_1px,transparent_1px)] [background-size:22px_22px]" />
        <div className="container-site relative py-12 sm:py-16">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-bold text-gold-200">
            <Star className="h-4 w-4" />
            {hijriDate(todayISO())}
          </p>
          <h1 className="mt-5 max-w-2xl font-display text-3xl font-black leading-tight sm:text-4xl">
            رجال الأمة
            <span className="mt-1 block text-xl font-bold text-gold-300 sm:text-2xl">
              مقرّرٌ يبني الإنسان… ومجتمعٌ يقرأ ويتفاعل
            </span>
          </h1>
          <p className="mt-4 max-w-xl leading-8 text-brand-100">
            تابع جدول المقرر الأسبوعي، واستعرض منشورات اليوم من مختلف الأقسام، وشارك
            بتفاعلاتك وتعليقاتك.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            {user?.role === 'admin' && (
              <Link to="/admin" className="btn-gold">
                <PenLine className="h-4 w-4" />
                إدارة المنشورات والجدول
              </Link>
            )}
            <a href="#postList" className="btn !bg-white/15 text-white hover:!bg-white/25">
              <Newspaper className="h-4 w-4" />
              منشورات اليوم
            </a>
          </div>
        </div>
      </section>

      {/* Categories chip bar */}
      <section className="container-site mt-8">
        <div className="flex flex-wrap gap-2">
          <span className="py-1.5 text-sm font-extrabold text-stone-500">الأقسام:</span>
          {categories.map((c) => (
            <Link key={c.id} to={`/category/${c.slug}`} className="chip">
              {c.name}
              <span className="rounded-full bg-white px-1.5 text-[11px] text-brand-500">{c.postCount}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Weekly schedule */}
      <section className="container-site mt-8">
        <ScheduleTable items={schedule} loading={loading} />
      </section>

      {/* Today's posts */}
      <section id="post-positions" className="container-site mt-10">
        <div className="mb-5 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold-100 text-gold-700">
            <Newspaper className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-display text-xl font-extrabold text-brand-950">منشورات اليوم</h2>
            <p className="text-sm text-stone-500">{hijriDate(todayISO())}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : posts.length === 0 ? (
          <EmptyState
            icon={Newspaper}
            title="لا توجد منشورات لليوم بعد"
            description="لم يُرفع أي منشور لهذا اليوم حتى الآن — عد لاحقاً ليطلّ المشرفون بالجديد"
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
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}