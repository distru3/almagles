import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, FolderOpen } from 'lucide-react';
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
    if (!window.confirm(`حذف قسم «${c.name}»؟ سيتم حذف كل منشورات هذا القسم.`)) return;
    try {
      await api(`/categories/${c.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'تعذّر الحذف');
    }
  };

  return (
    <div>
      <h2 className="font-display text-xl font-black text-brand-950">الأقسام</h2>
      <p className="text-sm text-stone-500">كل قسم له صفحته الخاصة بمنشوراته فقط</p>

      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <form onSubmit={save} className="card mt-4 flex gap-2 p-3">
        <input
          className="input flex-1"
          placeholder={editingId ? 'الاسم الجديد للقسم…' : 'اسم القسم الجديد…'}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
        />
        <button type="submit" className="btn-primary shrink-0" disabled={busy || !name.trim()}>
          {editingId ? 'حفظ' : <><Plus className="h-4 w-4" /> إضافة</>}
        </button>
        {editingId && (
          <button type="button" onClick={cancelEdit} className="btn-outline shrink-0">
            إلغاء
          </button>
        )}
      </form>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : categories.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={FolderOpen} title="لا توجد أقسام" description="أضف أول قسم من الأعلى" />
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {categories.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-100 bg-white p-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                <FolderOpen className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-extrabold text-brand-950">{c.name}</p>
                <p className="text-xs text-stone-500">
                  {c.postCount} منشور — رابط: /category/{c.slug}
                </p>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => startEdit(c)} className="btn-outline !px-2.5 !py-1.5" aria-label="تعديل">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => remove(c)} className="btn-danger !px-2.5 !py-1.5" aria-label="حذف">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}