import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PenLine, CalendarDays } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import type { Category } from '../../lib/types';
import AdminPostsTab from '../admin/AdminPostsTab';
import ScheduleBuilder from '../../components/schedule/ScheduleBuilder';
import { CouncilNotesWeek } from '../../components/schedule/CouncilNotes';

function PageHeader({ icon: Icon, title, subtitle }: { icon: typeof PenLine; title: string; subtitle: string }) {
  return (
    <div className="page-header">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-fill text-on-accent">
        <Icon className="h-6 w-6" />
      </span>
      <div>
        <h1 className="font-display text-2xl font-black text-fg">{title}</h1>
        <p className="text-sm text-muted">{subtitle}</p>
      </div>
    </div>
  );
}

export function WritePage() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [failed, setFailed] = useState(false);
  // ?tab=notes deep-links straight to «ملاحظات المجلس».
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'notes' ? 'notes' : 'posts';

  useEffect(() => {
    api<{ categories: Category[] }>('/categories')
      .then((res) => setCategories(res.categories))
      .catch(() => setFailed(true));
  }, []);

  if (failed) {
    return (
      <div className="container-site py-8">
        <p className="rounded-xl border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
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
      <div role="tablist" aria-label="أقسام صفحة النشر" className="tab-strip">
        {(
          [
            ['posts', 'المنشورات'],
            ['notes', 'ملاحظات المجلس'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setSearchParams(key === 'notes' ? { tab: 'notes' } : {})}
            className={`min-h-10 rounded-full px-4 font-display text-[15px] transition ${
              tab === key ? 'bg-accent-fill text-on-accent' : 'text-fg-2 hover:bg-surface-2 hover:text-fg'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'notes' ? (
        <CouncilNotesWeek />
      ) : (
        <>
          {count === 0 && (
            <p className="mb-4 rounded-xl border border-warn bg-warn-soft px-3 py-2 text-sm text-warn">
              لم تُوكَّل لك أي أقسام بعد — تواصل مع المشرف العام.
            </p>
          )}
          <AdminPostsTab categories={categories} />
        </>
      )}
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
      <ScheduleBuilder />
    </div>
  );
}
