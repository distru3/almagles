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
        api<{ total: number }>('/comments?limit=1'),
        isSuper ? api<{ users: any[] }>('/users') : Promise.resolve({ users: [] }),
      ]);

      if (catRes.status === 'fulfilled') {
        setCategories(catRes.value.categories);
      }

      setStats({
        categories: catRes.status === 'fulfilled' ? catRes.value.categories.length : 0,
        posts: postRes.status === 'fulfilled' ? (postRes.value.total ?? postRes.value.items.length) : 0,
        schedule: schedRes.status === 'fulfilled' ? schedRes.value.items.length : 0,
        comments: commRes.status === 'fulfilled' ? commRes.value.total : 0,
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
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-fill/20 px-2.5 py-0.5 text-xs font-black text-accent border border-accent/30">
      <Sparkles className="h-3 w-3" />
      مشرف عام
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-black text-fg">
      كاتب معتمد
    </span>
  );

  return (
    <div className="container-site py-8">
      {/* Top Header Bar */}
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4 border-b border-line/80 pb-6">
        <div className="flex items-center gap-3.5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-fill to-accent-fill text-fg shadow-md">
            <ShieldCheck className="h-7 w-7" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-black text-fg">
                لوحة التحكم
              </h1>
              {roleBadge}
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] font-bold text-fg-2">
                <Calendar className="h-3 w-3 text-accent" />
                {hijriDate(todayISO())}
              </span>
            </div>
            <p className="text-xs text-muted mt-1">
              مرحباً <strong className="text-fg">{user?.name}</strong> — إدارة محتوى الموقع وجدول المقرر الدراسي
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
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3.5 py-2 text-xs font-bold text-fg shadow-2xs hover:bg-surface-2 hover:text-fg transition"
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
                  ? 'border-accent bg-surface-2/90 shadow-md ring-1 ring-accent/30'
                  : 'border-line/90 bg-surface hover:border-line-strong hover:bg-surface-2/30 shadow-2xs'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span
                  className={`text-xs font-extrabold ${
                    isActive ? 'text-fg' : 'text-fg-2'
                  }`}
                >
                  {label}
                </span>
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${
                    isActive
                      ? 'bg-accent-fill text-on-accent'
                      : 'bg-surface-2 text-accent group-hover:bg-surface-2'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
              </div>

              <div className="mt-3 flex items-baseline justify-between w-full">
                <span
                  className={`text-2xl font-black font-display tracking-tight ${
                    isActive ? 'text-fg' : 'text-fg'
                  }`}
                >
                  {count}
                </span>
                <span className="text-[10px] text-muted">
                  {subtitle}
                </span>
              </div>

              {/* Active bottom accent bar */}
              <div
                className={`mt-2 h-1 w-full rounded-full transition-all ${
                  isActive
                    ? 'bg-accent-fill'
                    : 'bg-transparent group-hover:bg-surface-2/50'
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
