import { useEffect, useState } from 'react';
import { Plus, Pencil, Search, Trash2, Image as ImageIcon } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import type { Category, Post } from '../../lib/types';
import { hijriDate, gregorianLong } from '../../lib/dates';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';
import PostFormModal from './PostFormModal';

export default function AdminPosts({ categories }: { categories: Category[] }) {
  const { user } = useAuth();
  const isSuper = user?.role === 'admin';
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Post | null | 'new'>(null);
  const [query, setQuery] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api<{ items: Post[]; total: number }>(
        `/posts?limit=200${isSuper ? '' : '&managed=1'}`
      );
      setPosts(res.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر التحميل');
    } finally {
      setLoading(false);
    }
  };

  const visiblePosts = posts.filter((post) =>
    `${post.title} ${post.category.name} ${post.author.name}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    load();
  }, []);

  const remove = async (post: Post) => {
    if (!window.confirm(`حذف المنشور «${post.title}»؟ سيتم حذف تفاعلاته وتعليقاته أيضاً.`)) return;
    try {
      await api(`/posts/${post.id}`, { method: 'DELETE' });
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'تعذّر الحذف');
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-black text-brand-950">المنشورات</h2>
          <p className="text-sm text-stone-500">{visiblePosts.length} من {posts.length} منشور</p>
        </div>
        <button onClick={() => setEditing('new')} className="btn-primary">
          <Plus className="h-4 w-4" />
          منشور جديد
        </button>
      </div>

      <div className="mb-5 flex items-center gap-2 border-b border-brand-200 pb-4">
        <Search className="h-4 w-4 text-brand-500" />
        <input
          className="input max-w-md !py-2"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث في العناوين والأقسام…"
          aria-label="البحث في المنشورات"
        />
      </div>

      {error && <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : posts.length === 0 ? (
        <EmptyState icon={ImageIcon} title="لا توجد منشورات" description="أنشئ أول منشور من الزر أعلاه" />
      ) : visiblePosts.length === 0 ? (
        <EmptyState icon={Search} title="لا توجد نتائج" description="جرّب كلمة أخرى أو امسح البحث للعودة إلى كل المنشورات" />
      ) : (
        <div className="space-y-2">
          {visiblePosts.map((post) => (
            <div
              key={post.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-100 bg-white p-3"
            >
              {post.imageUrl && (
                <img src={post.imageUrl} alt="" className="h-12 w-16 rounded-lg object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-extrabold text-brand-950">{post.title}</p>
                <p className="text-xs text-stone-500">
                  {post.category.name} · {hijriDate(post.postDate)} · {post.commentsCount} تعليق
                </p>
              </div>
              <p className="hidden text-xs text-stone-400 lg:block">{gregorianLong(post.postDate)}</p>
              <div className="flex gap-1.5">
                <button onClick={() => setEditing(post)} className="btn-outline !px-2.5 !py-1.5" aria-label="تعديل">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => remove(post)} className="btn-danger !px-2.5 !py-1.5" aria-label="حذف">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <PostFormModal
          categories={categories}
          post={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
