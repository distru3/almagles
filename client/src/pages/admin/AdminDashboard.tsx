import { useEffect, useState } from 'react';
import {
  Newspaper,
  FolderOpen,
  CalendarDays,
  MessagesSquare,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import type { Category } from '../../lib/types';
import AdminPostsTab from './AdminPostsTab';
import AdminCategoriesTab from './AdminCategoriesTab';
import AdminScheduleTab from './AdminScheduleTab';
import AdminCommentsTab from './AdminCommentsTab';
import AdminUsersTab from './AdminUsersTab';

type Tab = 'posts' | 'categories' | 'schedule' | 'comments' | 'users';

const ALL_TABS: { key: Tab; label: string; icon: typeof Newspaper; superOnly?: boolean }[] = [
  { key: 'posts', label: 'المنشورات', icon: Newspaper },
  { key: 'categories', label: 'الأقسام', icon: FolderOpen, superOnly: true },
  { key: 'schedule', label: 'الجدول الأسبوعي', icon: CalendarDays },
  { key: 'comments', label: 'التعليقات', icon: MessagesSquare },
  { key: 'users', label: 'المستخدمون', icon: Users, superOnly: true },
];

export default function AdminDashboard() {
  const { user } = useAuth();
  const isSuper = user?.role === 'admin';
  const canSchedule = user?.canManageSchedule ?? false;
  const [tab, setTab] = useState<Tab>(() => {
    if (user?.role === 'admin') return 'posts';
    if ((user?.managedCategoryIds.length ?? 0) > 0) return 'posts';
    return 'schedule';
  });
  const [categories, setCategories] = useState<Category[]>([]);

  const hasCategories = (user?.managedCategoryIds.length ?? 0) > 0;
  const tabs = ALL_TABS.filter((t) => {
    if (t.superOnly) return isSuper;
    if (t.key === 'schedule') return isSuper || canSchedule;
    if (t.key === 'posts' || t.key === 'comments') return isSuper || hasCategories;
    return true;
  });

  useEffect(() => {
    if (!tabs.some((t) => t.key === tab)) setTab(tabs[0]?.key ?? 'posts');
  }, [tab, tabs]);

  useEffect(() => {
    api<{ categories: Category[] }>('/categories')
      .then((res) => setCategories(res.categories))
      .catch(() => {});
  }, [tab]);

  const subtitle = isSuper
    ? `أهلاً ${user?.name} — إدارة كاملة للمحتوى والصلاحيات`
    : 'لوحة صلاحياتك — الأقسام الموكلة إليك والجدول';

  return (
    <div className="container-site py-8">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gold-400 text-brand-950">
          <ShieldCheck className="h-6 w-6" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-black text-brand-950">لوحة التحكم</h1>
          <p className="text-sm text-stone-500">{subtitle}</p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
              tab === key
                ? 'bg-brand-800 text-white shadow-md'
                : 'border border-brand-200 bg-white text-brand-800 hover:bg-brand-50'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'posts' && <AdminPostsTab categories={categories} />}
      {tab === 'categories' && <AdminCategoriesTab />}
      {tab === 'schedule' && <AdminScheduleTab />}
      {tab === 'comments' && <AdminCommentsTab />}
      {tab === 'users' && <AdminUsersTab categories={categories} />}
    </div>
  );
}