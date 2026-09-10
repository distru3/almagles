import { useEffect, useState } from 'react';
import { PenLine, CalendarDays } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import type { Category } from '../../lib/types';
import AdminPostsTab from '../admin/AdminPostsTab';
import AdminScheduleTab from '../admin/AdminScheduleTab';

function PageHeader({ icon: Icon, title, subtitle }: { icon: typeof PenLine; title: string; subtitle: string }) {
  return (
    <div className="page-header">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gold-400 text-brand-950">
        <Icon className="h-6 w-6" />
      </span>
      <div>
        <h1 className="font-display text-2xl font-black text-brand-950">{title}</h1>
        <p className="text-sm text-stone-500">{subtitle}</p>
      </div>
    </div>
  );
}

export function WritePage() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api<{ categories: Category[] }>('/categories')
      .then((res) => setCategories(res.categories))
      .catch(() => setFailed(true));
  }, []);

  if (failed) {
    return (
      <div className="container-site py-8">
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          تعذّر تحميل الأقسام
        </p>
      </div>
    );
  }

  const count = user?.managedCategoryIds.length ?? 0;

  return (
    <div className="container-site py-8">
      <PageHeader
        icon={PenLine}
        title="صفحة النشر"
        subtitle={`أهلاً ${user?.name} — نشر وتحرير منشورات أقسامك الموكلة (${count})`}
      />
      {count === 0 && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          لم تُوكَّل لك أي أقسام بعد — تواصل مع المشرف العام.
        </p>
      )}
      <AdminPostsTab categories={categories} />
    </div>
  );
}

export function SchedulePage() {
  const { user } = useAuth();

  return (
    <div className="container-site py-8">
      <PageHeader
        icon={CalendarDays}
        title="الجدول الأسبوعي"
        subtitle={`أهلاً ${user?.name} — إضافة وتعديل جدول الفعاليات`}
      />
      <AdminScheduleTab />
    </div>
  );
}
