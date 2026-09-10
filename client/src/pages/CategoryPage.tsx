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

export default function CategoryPage() {
  const { slug = '' } = useParams();
  const { user } = useAuth();
  const [category, setCategory] = useState<Category | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
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
            `/posts?category=${encodeURIComponent(slug)}&page=1&limit=${PAGE_SIZE}`,
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
  }, [slug]);

  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api<{ items: Post[]; total: number }>(
        `/posts?category=${encodeURIComponent(slug)}&page=${page + 1}&limit=${PAGE_SIZE}`,
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
      <div className="page-header flex-wrap justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-800 text-white">
            <FolderOpen className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-black text-brand-950">{category?.name ?? '…'}</h1>
            {!loading && <p className="text-sm text-stone-500">{total} منشور — الأحدث أولاً</p>}
          </div>
        </div>
        {user?.role === 'admin' && (
          <Link to="/admin" className="btn-primary">
            <PenLine className="h-4 w-4" />
            إضافة منشور
          </Link>
        )}
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
