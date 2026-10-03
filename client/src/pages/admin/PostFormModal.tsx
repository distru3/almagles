import { useEffect, useState } from 'react';
import { X, Image as ImageIcon, Loader as LoaderIcon } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { compressImage, MAX_UPLOAD_BYTES } from '../../lib/image';
import { todayISO, hijriDate } from '../../lib/dates';
import { useAuth } from '../../context/AuthContext';
import type { Category, Post } from '../../lib/types';

interface Props {
  categories: Category[];
  post: Post | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function PostFormModal({ categories, post, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const mine = user?.managedCategoryIds ?? [];
  const scoped = user?.role === 'admin' ? categories : categories.filter((c) => mine.includes(c.id));
  const options =
    post && !scoped.some((c) => c.id === post.category.id) ? [post.category, ...scoped] : scoped;

  const [title, setTitle] = useState(post?.title ?? '');
  const [description, setDescription] = useState(post?.description ?? '');
  const [categoryId, setCategoryId] = useState(post?.category.id ?? options[0]?.id ?? '');
  const [postDate, setPostDate] = useState(post?.postDate ?? todayISO());
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(post?.imageUrl ?? null);
  const [removeImage, setRemoveImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (selected.size > 10 * 1024 * 1024) {
      setError('حجم الصورة يتجاوز الحد المسموح (١٠ ميغابايت)');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type)) {
      setError('صيغة الصورة غير مدعومة — يُسمح بـ JPG أو PNG أو WebP');
      return;
    }
    try {
      const blob = await compressImage(selected);
      if (blob.size > MAX_UPLOAD_BYTES) {
        setError('الصورة كبيرة جداً حتى بعد الضغط — اختر صورة أصغر (٤ ميغابايت كحد أقصى)');
        return;
      }
      const ext = blob.type === 'image/webp' ? '.webp' : blob.type === 'image/png' ? '.png' : '.jpg';
      const next = new File([blob], selected.name.replace(/\.[^.]+$/, '') + ext, { type: blob.type || selected.type });
      setFile(next);
      setPreview(URL.createObjectURL(next));
      setRemoveImage(false);
    } catch {
      setError('تعذّرت معالجة الصورة');
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);

    if (!categoryId) {
      setError('لم تُوكَّل لك أي أقسام للنشر بعد — تواصل مع المشرف العام');
      return;
    }

    const form = new FormData();
    form.append('title', title.trim());
    form.append('description', description.trim());
    form.append('categoryId', categoryId);
    form.append('postDate', postDate);
    if (file) form.append('image', file);
    if (post && removeImage && !file) form.append('removeImage', 'true');

    setBusy(true);
    try {
      if (post) {
        await api(`/posts/${post.id}`, { method: 'PUT', body: form });
      } else {
        await api('/posts', { method: 'POST', body: form });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر حفظ المنشور');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl border border-brand-100 dark:border-brand-800/90 dark:bg-[#0b1c15]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-brand-100 bg-white/95 px-6 py-4 backdrop-blur dark:border-brand-800/80 dark:bg-[#0b1c15]/95">
          <h3 className="font-display text-lg font-black text-brand-950 dark:text-stone-100">
            {post ? 'تعديل المنشور' : 'منشور جديد'}
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-brand-900/50 dark:hover:text-stone-200 transition"
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 px-6 py-5" encType="multipart/form-data">
          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-bold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label !mb-0">العنوان</label>
              <span className="text-[11px] text-stone-400">{title.length}/200</span>
            </div>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="اكتب عنواناً جذاباً ومعبراً للمنشور…"
              maxLength={200}
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label !mb-0">نص المنشور</label>
              <span className="text-[11px] text-stone-400">{description.length}/20000</span>
            </div>
            <textarea
              className="input min-h-40 resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="اكتب المحتوى الكامل للمنشور هنا…"
              maxLength={20000}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">القسم</label>
              {options.length === 0 ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                  لم تُوكَّل لك أي أقسام للنشر بعد — تواصل مع المشرف العام.
                </p>
              ) : (
                <select
                  className="input"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    اختر القسم
                  </option>
                  {options.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label !mb-0">تاريخ المنشور</label>
                {postDate && (
                  <span className="text-[11px] font-bold text-brand-700 dark:text-gold-300">
                    {hijriDate(postDate)}
                  </span>
                )}
              </div>
              <input
                type="date"
                className="input"
                value={postDate}
                onChange={(e) => setPostDate(e.target.value)}
                required
              />
              <p className="mt-1 text-[11px] text-stone-400 dark:text-stone-400">سيظهر ضمن منشورات هذا اليوم في الموقع</p>
            </div>
          </div>

          <div>
            <label className="label">صورة الغلاف (اختياري)</label>
            {preview && !removeImage ? (
              <div className="flex items-start gap-3 rounded-xl border border-brand-100 p-3 dark:border-brand-800/80 dark:bg-[#07160f]">
                <img src={preview} alt="معاينة" className="h-24 w-40 rounded-xl object-cover" />
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRemoveImage(true);
                      setPreview(null);
                      setFile(null);
                    }}
                    className="btn-danger !py-1 text-xs"
                  >
                    إزالة الصورة
                  </button>
                  <label className="btn-outline !py-1 text-xs cursor-pointer block text-center">
                    تغيير الصورة
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pickImage} />
                  </label>
                </div>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-200 bg-brand-50/50 px-4 py-6 text-sm text-brand-700 transition hover:border-brand-300 hover:bg-brand-50 dark:border-brand-800 dark:bg-[#07160f] dark:text-gold-300 dark:hover:border-gold-500/60 dark:hover:bg-brand-900/30">
                <ImageIcon className="h-6 w-6" />
                <span className="font-bold">اضغط لاختيار صورة الغلاف</span>
                <span className="text-xs text-stone-400 dark:text-stone-400">JPG / PNG / WebP — يتم ضغطها تلقائياً</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pickImage} />
              </label>
            )}
          </div>

          <div className="flex gap-3 pt-3 border-t border-brand-100/60 dark:border-brand-800/60">
            <button type="submit" className="btn-primary flex-1" disabled={busy || !title.trim() || !description.trim()}>
              {busy && <LoaderIcon className="h-4 w-4 animate-spin" />}
              <span>{post ? 'حفظ التعديلات' : 'نشر المنشور'}</span>
            </button>
            <button type="button" onClick={onClose} className="btn-outline">
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}