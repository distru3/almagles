import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Newspaper,
  FolderOpen,
  CalendarDays,
  MessagesSquare,
  ShieldCheck,
  Users,
  ExternalLink,
  Sparkles,
  Plus,
  Calendar,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { todayISO, hijriDate } from '../../lib/dates';
import type { Category } from '../../lib/types';
import AdminPostsTab from './AdminPostsTab';
import AdminCategoriesTab from './AdminCategoriesTab';
import AdminScheduleTab from './AdminScheduleTab';
import AdminCommentsTab from './AdminCommentsTab';
import AdminUsersTab from './AdminUsersTab';
import PostFormModal from './PostFormModal';

type Tab = 'posts' | 'categories' | 'schedule' | 'comments' | 'users';

const ALL_TABS: { key: Tab; label: string; icon: typeof Newspaper; superOnly?: boolean; subtitle: string }[] = [
  { key: 'posts', label: 'المنشورات', icon: Newspaper, subtitle: 'إدارة وتعديل المقالات' },
  { key: 'categories', label: 'الأقسام', icon: FolderOpen, superOnly: true, subtitle: 'تصنيفات المحتوى' },
  { key: 'schedule', label: 'الجدول الأسبوعي', icon: CalendarDays, subtitle: 'أنشطة المقرر اليومية' },
  { key: 'comments', label: 'التعليقات', icon: MessagesSquare, subtitle: 'مشاركات وتفاعل الزوار' },
  { key: 'users', label: 'المستخدمون', icon: Users, superOnly: true, subtitle: 'الصلاحيات والكتّاب' },
];

export default function AdminDashboard() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const isSuper = user?.role === 'admin';
  const canSchedule = user?.canManageSchedule ?? false;
  const paramTab = searchParams.get('tab') as Tab | null;

  const [tab, setTab] = useState<Tab>(() => {
    if (paramTab && ALL_TABS.some((t) => t.key === paramTab)) return paramTab;
    if (user?.role === 'admin') return 'posts';
    if ((user?.managedCategoryIds.length ?? 0) > 0) return 'posts';
    return 'schedule';
  });
  const [categories, setCategories] = useState<Category[]>([]);
  const [showGlobalNewPost, setShowGlobalNewPost] = useState(false);
  const [stats, setStats] = useState<{
    posts: number;
    categories: number;
    schedule: number;
    comments: number;
    users: number;
  }>({
    posts: 0,
    categories: 0,
    schedule: 0,
    comments: 0,
    users: 0,
  });

  const hasCategories = (user?.managedCategoryIds.length ?? 0) > 0;
  const canCreatePost = isSuper || hasCategories;

  const tabs = ALL_TABS.filter((t) => {
    if (t.superOnly) return isSuper;
    if (t.key === 'schedule') return isSuper || canSchedule;
    if (t.key === 'posts' || t.key === 'comments') return isSuper || hasCategories;
    return true;
  });

  useEffect(() => {
    if (paramTab && tabs.some((t) => t.key === paramTab) && paramTab !== tab) {
      setTab(paramTab);
    }
  }, [paramTab, tabs]);

  useEffect(() => {
    if (!tabs.some((t) => t.key === tab)) setTab(tabs[0]?.key ?? 'posts');
  }, [tab, tabs]);

  // Load stats and categories
  const loadOverview = async () => {
    try {
      const [catRes, postRes, schedRes, commRes, usersRes] = await Promise.allSettled([
        api<{ categories: Category[] }>('/categories'),
        api<{ items: any[]; total: number }>('/posts?limit=1'),
        api<{ items: any[] }>('/schedule'),
        api<{ comments: any[] }>('/comments'),
        isSuper ? api<{ users: any[] }>('/users') : Promise.resolve({ users: [] }),
      ]);

      if (catRes.status === 'fulfilled') {
        setCategories(catRes.value.categories);
      }

      setStats({
        categories: catRes.status === 'fulfilled' ? catRes.value.categories.length : 0,
        posts: postRes.status === 'fulfilled' ? (postRes.value.total ?? postRes.value.items.length) : 0,
        schedule: schedRes.status === 'fulfilled' ? schedRes.value.items.length : 0,
        comments: commRes.status === 'fulfilled' ? commRes.value.comments.length : 0,
        users: usersRes.status === 'fulfilled' ? (usersRes.value as any).users?.length ?? 0 : 0,
      });
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    loadOverview();
  }, [tab]);

  const roleBadge = isSuper ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-gold-400/20 px-2.5 py-0.5 text-xs font-black text-gold-700 border border-gold-400/30 dark:text-gold-300">
      <Sparkles className="h-3 w-3" />
      مشرف عام
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-black text-brand-800 dark:bg-brand-900/60 dark:text-gold-300">
      كاتب معتمد
    </span>
  );

  return (
    <div className="container-site py-8">
      {/* Top Header Bar */}
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4 border-b border-brand-200/80 pb-6 dark:border-brand-800/80">
        <div className="flex items-center gap-3.5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-gold-400 to-gold-600 text-brand-950 shadow-md">
            <ShieldCheck className="h-7 w-7" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-black text-brand-950 dark:text-stone-100">
                لوحة التحكم
              </h1>
              {roleBadge}
              <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-bold text-stone-600 dark:bg-[#07160f] dark:border dark:border-brand-800 dark:text-stone-300">
                <Calendar className="h-3 w-3 text-brand-600 dark:text-gold-400" />
                {hijriDate(todayISO())}
              </span>
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
              مرحباً <strong className="text-brand-900 dark:text-gold-300">{user?.name}</strong> — إدارة محتوى الموقع وجدول المقرر الدراسي
            </p>
          </div>
        </div>

        {/* Quick Actions in Header */}
        <div className="flex items-center gap-2.5">
          {canCreatePost && (
            <button
              type="button"
              onClick={() => setShowGlobalNewPost(true)}
              className="btn-primary !py-2 text-xs inline-flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              <span>منشور جديد</span>
            </button>
          )}

          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-xl border border-brand-200 bg-white px-3.5 py-2 text-xs font-bold text-brand-800 shadow-2xs hover:bg-brand-50 hover:text-brand-950 dark:border-brand-800 dark:bg-[#0d221a] dark:text-stone-300 dark:hover:bg-brand-900/40 dark:hover:text-gold-300 transition"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">الموقع العام</span>
          </Link>
        </div>
      </div>

      {/* Unified Tab Navigation & KPIs Bar */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tabs.map(({ key, label, icon: Icon, subtitle }) => {
          const isActive = tab === key;
          const count =
            key === 'posts'
              ? stats.posts
              : key === 'categories'
              ? stats.categories
              : key === 'schedule'
              ? stats.schedule
              : key === 'comments'
              ? stats.comments
              : stats.users;

          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setTab(key);
                setSearchParams({ tab: key });
              }}
              className={`group relative flex flex-col justify-between text-right p-4 rounded-2xl border transition-all duration-200 ${
                isActive
                  ? 'border-brand-600 bg-brand-50/90 shadow-md ring-1 ring-brand-600/30 dark:border-gold-500/80 dark:bg-[#133023] dark:ring-gold-500/30'
                  : 'border-brand-100/90 bg-white hover:border-brand-300 hover:bg-brand-50/30 shadow-2xs dark:border-brand-800/80 dark:bg-[#0b1c15] dark:hover:border-brand-700 dark:hover:bg-[#0e241c]'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span
                  className={`text-xs font-extrabold ${
                    isActive ? 'text-brand-800 dark:text-gold-300' : 'text-stone-600 dark:text-stone-300'
                  }`}
                >
                  {label}
                </span>
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${
                    isActive
                      ? 'bg-brand-600 text-white dark:bg-gold-500 dark:text-brand-950'
                      : 'bg-brand-50 text-brand-700 dark:bg-brand-900/60 dark:text-gold-400 group-hover:bg-brand-100'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
              </div>

              <div className="mt-3 flex items-baseline justify-between w-full">
                <span
                  className={`text-2xl font-black font-display tracking-tight ${
                    isActive ? 'text-brand-950 dark:text-gold-100' : 'text-brand-900 dark:text-stone-100'
                  }`}
                >
                  {count}
                </span>
                <span className="text-[10px] text-stone-400 dark:text-stone-400">
                  {subtitle}
                </span>
              </div>

              {/* Active bottom accent bar */}
              <div
                className={`mt-2 h-1 w-full rounded-full transition-all ${
                  isActive
                    ? 'bg-brand-600 dark:bg-gold-400'
                    : 'bg-transparent group-hover:bg-brand-200/50 dark:group-hover:bg-brand-800/40'
                }`}
              />
            </button>
          );
        })}
      </div>

      {/* Active Tab Panel */}
      <div className="min-h-[450px]">
        {tab === 'posts' && <AdminPostsTab categories={categories} />}
        {tab === 'categories' && <AdminCategoriesTab />}
        {tab === 'schedule' && <AdminScheduleTab />}
        {tab === 'comments' && <AdminCommentsTab />}
        {tab === 'users' && <AdminUsersTab categories={categories} />}
      </div>

      {/* Global Quick Post Modal */}
      {showGlobalNewPost && (
        <PostFormModal
          categories={categories}
          post={null}
          onClose={() => setShowGlobalNewPost(false)}
          onSaved={() => {
            setShowGlobalNewPost(false);
            loadOverview();
            if (tab !== 'posts') {
              setTab('posts');
              setSearchParams({ tab: 'posts' });
            }
          }}
        />
      )}
    </div>
  );
}
