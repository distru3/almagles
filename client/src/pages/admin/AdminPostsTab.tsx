import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Pencil,
  Search,
  Trash2,
  Image as ImageIcon,
  ExternalLink,
  MessageSquare,
  Sparkles,
  X,
  LayoutGrid,
  List,
  ArrowUpDown,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import type { Category, Post } from '../../lib/types';
import { hijriDate } from '../../lib/dates';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';
import PostFormModal from './PostFormModal';

// The list endpoint returns per-type counts, not totalReactions.
function reactionTotal(post: Post): number {
  return Object.values(post.reactionCounts ?? {}).reduce((sum, n) => sum + n, 0);
}

export default function AdminPosts({ categories }: { categories: Category[] }) {
  const { user, loading: authLoading } = useAuth();
  const isSuper = user?.role === 'admin';
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Post | null | 'new'>(null);
  const [query, setQuery] = useState('');
  const [selectedCat, setSelectedCat] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'reactions' | 'comments'>('newest');

  const load = async () => {
    if (authLoading) return;
    setLoading(true);
    try {
      // Filtering/sorting below is client-side, so page through everything
      // rather than silently stopping at the API's 200-per-page cap.
      const all: Post[] = [];
      for (let page = 1; ; page++) {
        const res = await api<{ items: Post[]; total: number }>(
          `/posts?limit=200&page=${page}${isSuper ? '' : '&managed=1'}`
        );
        all.push(...res.items);
        if (res.items.length === 0 || all.length >= res.total) break;
      }
      setPosts(all);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر التحميل');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      load();
    }
  }, [authLoading, isSuper]);

  const visiblePosts = useMemo(() => {
    const filtered = posts.filter((post) => {
      const matchesCat = selectedCat === 'all' || post.category.id === selectedCat;
      const matchesSearch = `${post.title} ${post.description} ${post.category.name} ${post.author.name}`
        .toLowerCase()
        .includes(query.trim().toLowerCase());
      return matchesCat && matchesSearch;
    });

    return filtered.sort((a, b) => {
      if (sortBy === 'oldest') {
        return a.postDate.localeCompare(b.postDate);
      }
      if (sortBy === 'reactions') {
        return reactionTotal(b) - reactionTotal(a);
      }
      if (sortBy === 'comments') {
        return (b.commentsCount ?? 0) - (a.commentsCount ?? 0);
      }
      // default newest
      return b.postDate.localeCompare(a.postDate);
    });
  }, [posts, selectedCat, query, sortBy]);

  const remove = async (post: Post) => {
    if (!window.confirm(`حذف المنشور «${post.title}»؟ سيتم حذف تفاعلاته وتعليقاته أيضاً.`)) return;
    try {
      await api(`/posts/${post.id}`, { method: 'DELETE' });
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'تعذّر الحذف');
    }
  };

  const isFiltered = query.trim() !== '' || selectedCat !== 'all';

  return (
    <div>
      {/* Header bar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-black text-brand-950 dark:text-stone-100">
            إدارة المنشورات
          </h2>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            عرض {visiblePosts.length} من أصل {posts.length} منشور
          </p>
        </div>
        <button onClick={() => setEditing('new')} className="btn-primary !py-2 text-xs shadow-sm">
          <Plus className="h-4 w-4" />
          <span>منشور جديد</span>
        </button>
      </div>

      {/* Control Bar: Search + Category Selector + Sort + View Mode */}
      <div className="mb-6 space-y-3 rounded-2xl border border-brand-100 bg-white/70 p-3.5 backdrop-blur-sm shadow-2xs dark:border-brand-800/80 dark:bg-[#0b1c15]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search box */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
            <input
              className="input !py-2 pr-9 pl-8 text-xs w-full"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث بالعنوان أو الكاتب أو المحتوى…"
              aria-label="البحث في المنشورات"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Controls: Sort + View Mode */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-xl border border-brand-200/80 bg-white px-2.5 py-1 text-xs dark:border-brand-800 dark:bg-[#07160f]">
              <ArrowUpDown className="h-3.5 w-3.5 text-stone-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent text-xs font-bold text-stone-700 dark:text-stone-200 focus:outline-none cursor-pointer"
              >
                <option value="newest">الأحدث أولاً</option>
                <option value="oldest">الأقدم أولاً</option>
                <option value="reactions">الأكثر تفاعلاً</option>
                <option value="comments">الأكثر تعليقاً</option>
              </select>
            </div>

            {/* View Mode Toggle Buttons */}
            <div className="flex items-center rounded-xl border border-brand-200/80 bg-white p-0.5 dark:border-brand-800 dark:bg-[#07160f]">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`rounded-lg p-1.5 transition ${
                  viewMode === 'grid'
                    ? 'bg-brand-700 text-white dark:bg-gold-500 dark:text-brand-950'
                    : 'text-stone-400 hover:text-stone-700 dark:hover:text-stone-200'
                }`}
                title="عرض شبكي"
                aria-label="عرض شبكي"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`rounded-lg p-1.5 transition ${
                  viewMode === 'list'
                    ? 'bg-brand-700 text-white dark:bg-gold-500 dark:text-brand-950'
                    : 'text-stone-400 hover:text-stone-700 dark:hover:text-stone-200'
                }`}
                title="عرض قائمة"
                aria-label="عرض قائمة"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Category Chip Selector */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-brand-100/60 dark:border-brand-800/60 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedCat('all')}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition shrink-0 ${
              selectedCat === 'all'
                ? 'bg-brand-700 text-white dark:bg-gold-500 dark:text-brand-950 shadow-xs'
                : 'border border-brand-200/80 bg-white text-stone-600 hover:bg-brand-50 dark:border-brand-800 dark:bg-[#07160f] dark:text-stone-300 dark:hover:bg-brand-900/40'
            }`}
          >
            الكل ({posts.length})
          </button>
          {categories.map((c) => {
            const count = posts.filter((p) => p.category.id === c.id).length;
            const isSelected = selectedCat === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCat(c.id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition shrink-0 ${
                  isSelected
                    ? 'bg-brand-700 text-white dark:bg-gold-500 dark:text-brand-950 shadow-xs'
                    : 'border border-brand-200/80 bg-white text-stone-600 hover:bg-brand-50 dark:border-brand-800 dark:bg-[#07160f] dark:text-stone-300 dark:hover:bg-brand-900/40'
                }`}
              >
                {c.name} ({count})
              </button>
            );
          })}

          {isFiltered && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSelectedCat('all');
              }}
              className="mr-auto inline-flex items-center gap-1 rounded-lg text-xs font-bold text-red-600 hover:text-red-700 dark:text-red-400 px-2 py-1 transition"
            >
              <X className="h-3.5 w-3.5" />
              <span>إلغاء التصفية</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-bold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : posts.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title="لا توجد منشورات بعد"
          description="ابدأ بإضافة أول منشور للموقع عبر الزر أعلاه"
          action={
            <button onClick={() => setEditing('new')} className="btn-primary mt-2">
              <Plus className="h-4 w-4" />
              <span>إضافة منشور</span>
            </button>
          }
        />
      ) : visiblePosts.length === 0 ? (
        <EmptyState
          icon={Search}
          title="لم يتم العثور على نتائج"
          description="جرّب تعديل كلمة البحث أو اختيار قسم مختلف"
          action={
            <button
              onClick={() => {
                setQuery('');
                setSelectedCat('all');
              }}
              className="btn-outline mt-2"
            >
              عرض جميع المنشورات
            </button>
          }
        />
      ) : viewMode === 'grid' ? (
        /* GRID VIEW */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visiblePosts.map((post) => (
            <div
              key={post.id}
              className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-2xs transition-all duration-200 hover:-translate-y-1 hover:border-brand-300 hover:shadow-md dark:border-brand-800/80 dark:bg-[#0b1c15] dark:hover:border-gold-500/60"
            >
              {/* Card Image Banner */}
              <div className="relative aspect-video w-full overflow-hidden bg-brand-50 dark:bg-[#07160f] border-b border-brand-100/60 dark:border-brand-800/60">
                {post.imageUrl ? (
                  <img
                    src={post.imageUrl}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-stone-400 dark:text-stone-600">
                    <ImageIcon className="h-8 w-8" />
                  </div>
                )}
                <span className="absolute top-2.5 right-2.5 rounded-md bg-brand-950/80 backdrop-blur-md px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                  {post.category.name}
                </span>
                <span className="absolute bottom-2.5 right-2.5 rounded-md bg-white/90 dark:bg-[#0b1c15]/90 backdrop-blur-md px-2 py-0.5 text-[10px] font-bold text-brand-900 dark:text-gold-300 shadow-sm">
                  {hijriDate(post.postDate)}
                </span>
              </div>

              {/* Card Content */}
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="font-display text-sm font-black text-brand-950 dark:text-stone-100 group-hover:text-brand-800 dark:group-hover:text-gold-300 line-clamp-2 leading-snug">
                    {post.title}
                  </h3>
                  {post.description && (
                    <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400 line-clamp-2 leading-relaxed">
                      {post.description}
                    </p>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-brand-100/60 dark:border-brand-800/60 flex items-center justify-between text-[11px] text-stone-400">
                  <span className="truncate max-w-[110px]">بواسطة: {post.author.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {post.commentsCount}
                    </span>
                    {reactionTotal(post) > 0 && (
                      <span className="inline-flex items-center gap-1 text-gold-600 dark:text-gold-400">
                        <Sparkles className="h-3 w-3" />
                        {reactionTotal(post)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="flex items-center gap-1 p-2.5 bg-brand-50/40 dark:bg-[#07160f]/60 border-t border-brand-100/60 dark:border-brand-800/60">
                <Link
                  to={`/post/${post.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-outline !py-1.5 flex-1 text-xs inline-flex items-center justify-center gap-1"
                  title="عرض المنشور في الموقع"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>معاينة</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setEditing(post)}
                  className="btn-outline !py-1.5 flex-1 text-xs inline-flex items-center justify-center gap-1"
                  title="تعديل المنشور"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span>تعديل</span>
                </button>
                <button
                  type="button"
                  onClick={() => remove(post)}
                  className="btn-danger !py-1.5 !px-2.5 text-xs inline-flex items-center justify-center"
                  title="حذف المنشور"
                  aria-label="حذف"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* LIST VIEW */
        <div className="space-y-2.5">
          {visiblePosts.map((post) => (
            <div
              key={post.id}
              className="group flex flex-wrap items-center gap-3.5 rounded-2xl border border-brand-100 bg-white p-3.5 shadow-2xs transition hover:border-brand-300 hover:shadow-sm dark:border-brand-800/80 dark:bg-[#0b1c15] dark:hover:border-gold-500/60"
            >
              {/* Thumbnail preview */}
              <div className="h-14 w-20 shrink-0 overflow-hidden rounded-xl bg-brand-50 dark:bg-[#07160f] flex items-center justify-center border border-brand-100/60 dark:border-brand-800/60">
                {post.imageUrl ? (
                  <img src={post.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-5 w-5 text-stone-400 dark:text-stone-600" />
                )}
              </div>

              {/* Post Details */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-brand-900/60 dark:text-gold-300">
                    {post.category.name}
                  </span>
                  <span className="text-[11px] font-bold text-stone-500 dark:text-gold-400/80">
                    {hijriDate(post.postDate)}
                  </span>
                </div>
                <h3 className="mt-1 truncate font-display text-sm font-extrabold text-brand-950 dark:text-stone-100 group-hover:text-brand-800 dark:group-hover:text-gold-300">
                  {post.title}
                </h3>
                <div className="mt-1 flex items-center gap-3 text-[11px] text-stone-400">
                  <span>الكاتب: {post.author.name}</span>
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />
                    {post.commentsCount} تعليق
                  </span>
                  {post.totalReactions !== undefined && post.totalReactions > 0 && (
                    <span className="inline-flex items-center gap-1 text-gold-600 dark:text-gold-400">
                      <Sparkles className="h-3 w-3" />
                      {post.totalReactions} تفاعل
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 shrink-0">
                <Link
                  to={`/post/${post.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-outline !px-2.5 !py-1.5 text-xs inline-flex items-center gap-1"
                  title="عرض المنشور في الموقع"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">معاينة</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setEditing(post)}
                  className="btn-outline !px-2.5 !py-1.5 text-xs inline-flex items-center gap-1"
                  aria-label="تعديل"
                  title="تعديل المنشور"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">تعديل</span>
                </button>
                <button
                  type="button"
                  onClick={() => remove(post)}
                  className="btn-danger !px-2.5 !py-1.5 text-xs inline-flex items-center gap-1"
                  aria-label="حذف"
                  title="حذف المنشور"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">حذف</span>
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
