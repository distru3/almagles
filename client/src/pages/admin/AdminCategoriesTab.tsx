import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, FolderOpen, ExternalLink, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { Category } from '../../lib/types';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';

export default function AdminCategoriesTab() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await api<{ categories: Category[] }>('/categories');
      setCategories(res.categories);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر التحميل');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (editingId) {
        await api(`/categories/${editingId}`, { method: 'PUT', body: { name: name.trim() } });
      } else {
        await api('/categories', { method: 'POST', body: { name: name.trim() } });
      }
      setName('');
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر الحفظ');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (c: Category) => {
    setEditingId(c.id);
    setName(c.name);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName('');
  };

  const remove = async (c: Category) => {
    if (c.postCount > 0) {
      alert(`لا يمكن حذف قسم «${c.name}» لأنه يحتوي على ${c.postCount} منشور — انقل المنشورات أو احذفها أولاً.`);
      return;
    }
    if (!window.confirm(`حذف قسم «${c.name}»؟`)) return;
    try {
      await api(`/categories/${c.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'تعذّر الحذف');
    }
  };

  return (
    <div>
      <div className="mb-4">
        <h2 className="font-display text-xl font-black text-fg">
          إدارة الأقسام
        </h2>
        <p className="text-xs text-muted mt-0.5">
          كل قسم يمثّل تصنيفاً مستقلاً وله صفحته وروابطه الخاصة
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-xl border border-danger bg-danger-soft px-3.5 py-2 text-xs font-bold text-danger">
          {error}
        </p>
      )}

      {/* Responsive 2-Column Studio Layout */}
      <div className="grid gap-6 lg:grid-cols-3 items-start">
        {/* Creation / Edit Form Panel */}
        <div className="lg:col-span-1">
          <form
            onSubmit={save}
            className="card p-4 rounded-2xl border border-line sticky top-4 shadow-sm"
          >
            <div className="flex items-center justify-between mb-3 border-b border-line/60 pb-2.5">
              <h3 className="font-display text-sm font-black text-fg">
                {editingId ? 'تعديل اسم القسم' : 'إضافة قسم جديد'}
              </h3>
              {editingId && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="text-xs text-muted hover:text-fg-2 inline-flex items-center gap-1"
                >
                  <X className="h-3 w-3" />
                  <span>إلغاء</span>
                </button>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="label">اسم القسم</label>
                <input
                  className="input !py-2 text-sm"
                  placeholder="مثال: العقيدة، التفسير، الفقه…"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={50}
                  autoFocus={Boolean(editingId)}
                  required
                />
              </div>

              {name.trim() && (
                <div className="rounded-xl border border-line bg-surface-2/50 p-2.5 text-xs">
                  <span className="text-[10px] text-muted block mb-0.5">معاينة مسار الرابط:</span>
                  <span className="font-mono text-accent font-bold truncate block" dir="ltr">
                    /category/{name.trim().toLowerCase().replace(/\s+/g, '-')}
                  </span>
                </div>
              )}

              <button
                type="submit"
                className="btn-primary w-full !py-2.5 text-xs shadow-sm"
                disabled={busy || !name.trim()}
              >
                {editingId ? 'حفظ التعديل' : <><Plus className="h-4 w-4" /> إضافة القسم للموقع</>}
              </button>
            </div>
          </form>
        </div>

        {/* Categories Grid List */}
        <div className="lg:col-span-2">
          {loading ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : categories.length === 0 ? (
            <EmptyState
              icon={FolderOpen}
              title="لا توجد أقسام بعد"
              description="أضف أول قسم عبر النموذج المجاور لتصنيف منشورات المقرر"
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {categories.map((c) => (
                <div
                  key={c.id}
                  className="group flex flex-col justify-between rounded-2xl border border-line bg-surface p-4 shadow-2xs transition hover:border-line-strong hover:shadow-sm"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-accent">
                        <FolderOpen className="h-4.5 w-4.5" />
                      </span>
                      <span className="rounded-full bg-surface-2/70 px-2.5 py-0.5 text-[11px] font-black text-fg">
                        {c.postCount} منشور
                      </span>
                    </div>

                    <h3 className="font-display text-sm font-black text-fg group-hover:text-fg">
                      {c.name}
                    </h3>
                    <p className="mt-1 text-xs text-muted font-mono truncate" dir="ltr">
                      /category/{c.slug}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-line/60 flex items-center justify-end gap-1.5">
                    <Link
                      to={`/category/${c.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-outline !py-1 !px-2.5 text-xs inline-flex items-center gap-1"
                      title="فتح صفحة القسم في الموقع"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>معاينة</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => startEdit(c)}
                      className="btn-outline !py-1 !px-2.5 text-xs inline-flex items-center gap-1"
                      aria-label="تعديل"
                      title="تعديل القسم"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span>تعديل</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(c)}
                      className="btn-danger !py-1 !px-2.5 text-xs inline-flex items-center gap-1"
                      aria-label="حذف"
                      title="حذف القسم"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}