import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FolderOpen, Newspaper, PenLine, Loader as LoaderIcon } from 'lucide-react';
import { api } from '../lib/api';
import type { Category, Post } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import PostCard from '../components/PostCard';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';

const PAGE_SIZE = 9;

type SortType = 'newest' | 'reactions' | 'oldest';

export default function CategoryPage() {
  const { slug = '' } = useParams();
  const { user } = useAuth();
  const [category, setCategory] = useState<Category | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [sort, setSort] = useState<SortType>('newest');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [catRes, postsRes] = await Promise.all([
          api<{ categories: Category[] }>('/categories'),
          api<{ items: Post[]; total: number }>(
            `/posts?category=${encodeURIComponent(slug)}&sort=${sort}&page=1&limit=${PAGE_SIZE}`,
          ),
        ]);
        if (!active) return;
        setCategory(catRes.categories.find((c) => c.slug === slug) ?? null);
        setPosts(postsRes.items);
        setTotal(postsRes.total);
        setPage(1);
      } catch {
        if (active) setError('تعذّر تحميل القسم');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [slug, sort]);

  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api<{ items: Post[]; total: number }>(
        `/posts?category=${encodeURIComponent(slug)}&sort=${sort}&page=${page + 1}&limit=${PAGE_SIZE}`,
      );
      setPosts((prev) => [...prev, ...res.items]);
      setTotal(res.total);
      setPage((p) => p + 1);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="container-site py-8">
      <div className="page-header flex-wrap justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-fill text-on-accent">
            <FolderOpen className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-black text-fg">
              {category?.name ?? '…'}
            </h1>
            {!loading && <p className="text-sm text-muted">{total} منشور</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Sorting Pills */}
          <div className="inline-flex items-center gap-1 rounded-xl border border-line/80 bg-surface p-1 shadow-sm">
            <button
              onClick={() => setSort('newest')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                sort === 'newest'
                  ? 'bg-accent-fill text-on-accent shadow-sm'
                  : 'text-fg-2 hover:text-fg'
              }`}
            >
              الأحدث
            </button>
            <button
              onClick={() => setSort('reactions')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                sort === 'reactions'
                  ? 'bg-accent-fill text-on-accent shadow-sm'
                  : 'text-fg-2 hover:text-fg'
              }`}
            >
              الأكثر تفاعلاً
            </button>
            <button
              onClick={() => setSort('oldest')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                sort === 'oldest'
                  ? 'bg-accent-fill text-on-accent shadow-sm'
                  : 'text-fg-2 hover:text-fg'
              }`}
            >
              الأقدم
            </button>
          </div>

          {user?.role === 'admin' && (
            <Link to="/admin" className="btn-primary">
              <PenLine className="h-4 w-4" />
              إضافة منشور
            </Link>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : error ? (
        <EmptyState icon={Newspaper} title={error} />
      ) : posts.length === 0 ? (
        <EmptyState
          icon={Newspaper}
          title="لا توجد منشورات في هذا القسم بعد"
          description="ستظهر منشورات هذا القسم هنا منفردةً دون اختلاط بغيرها"
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
          {posts.length < total && (
            <div className="mt-8 flex justify-center">
              <button onClick={loadMore} className="btn-outline" disabled={loadingMore}>
                {loadingMore && <LoaderIcon className="h-4 w-4 animate-spin" />}
                تحميل المزيد ({posts.length} من {total})
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
