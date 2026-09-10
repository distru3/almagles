import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Calendar, User, X, ZoomIn } from 'lucide-react';
import { api } from '../lib/api';
import type { CommentItem, Post } from '../lib/types';
import { hijriDate, gregorianLong } from '../lib/dates';
import { cloudinaryUrl } from '../lib/image';
import ReactionBar from '../components/ReactionBar';
import CommentSection from '../components/CommentSection';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';

export default function PostPage() {
  const { id = '' } = useParams();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  const loadComments = useCallback(async () => {
    try {
      const res = await api<{ comments: CommentItem[] }>(`/comments/post/${id}`);
      setComments(res.comments);
    } catch {
      /* ignore */
    }
  }, [id]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const res = await api<Post>(`/posts/${id}`);
        if (active) setPost(res);
      } catch {
        if (active) setNotFound(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    if (active) loadComments();
    return () => {
      active = false;
    };
  }, [id, loadComments]);

  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomed(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [zoomed]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (notFound || !post) {
    return (
      <div className="container-site py-16">
        <EmptyState icon={Calendar} title="المنشور غير موجود" description="ربما تم حذفه أو أن الرابط غير صحيح" />
      </div>
    );
  }

  const image = post.imageUrl ? cloudinaryUrl(post.imageUrl, 1100) : null;

  return (
    <article className="container-site py-8">
      <Link
        to={`/category/${post.category.slug}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-brand-600 hover:text-brand-800"
      >
        <ArrowRight className="h-4 w-4 rotate-180" />
        {post.category.name}
      </Link>

      <div className="mx-auto max-w-3xl">
        <div className="card card-editorial overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 px-5 pt-5 sm:px-7">
            <Link to={`/category/${post.category.slug}`} className="chip text-xs">
              {post.category.name}
            </Link>
            <span className="text-xs text-stone-400">{hijriDate(post.postDate)}</span>
          </div>

          <h1 className="px-5 pt-3 font-display text-2xl font-black leading-10 text-brand-950 sm:px-7 sm:text-3xl">
            {post.title}
          </h1>

          <div className="flex flex-wrap items-center gap-4 px-5 py-3 text-sm text-stone-500 sm:px-7">
            <span className="inline-flex items-center gap-1.5">
              <User className="h-4 w-4" />
              {post.author.name}
            </span>
            <span className="inline-flex items-center gap-1.5" title={gregorianLong(post.postDate)}>
              <Calendar className="h-4 w-4" />
              {hijriDate(post.postDate)}
            </span>
          </div>

          {image && (
            <div className="px-5 pt-5 sm:px-7">
              <button
                type="button"
                onClick={() => setZoomed(true)}
                className="group relative mx-auto block w-full max-w-xl overflow-hidden rounded-2xl border border-brand-100 shadow-sm"
                aria-label="تكبير الصورة"
              >
                <img src={image} alt={post.title} className="mx-auto w-full object-contain" />
                <span className="absolute bottom-3 left-3 flex h-9 w-9 items-center justify-center rounded-full bg-brand-950/70 text-white opacity-0 transition group-hover:opacity-100">
                  <ZoomIn className="h-5 w-5" />
                </span>
              </button>
            </div>
          )}

          <div className="prose-ar whitespace-pre-line px-5 py-6 text-base sm:px-7">{post.description}</div>

          <div className="border-t border-brand-100 px-5 py-4 sm:px-7">
            <ReactionBar
              postId={post.id}
              counts={post.reactionCounts}
              myReaction={post.myReaction}
              total={post.totalReactions}
              onChange={(counts, my) =>
                setPost((p) =>
                  p
                    ? {
                        ...p,
                        reactionCounts: counts,
                        myReaction: my,
                        totalReactions: Object.values(counts).reduce((s, v) => s + v, 0),
                      }
                    : p,
                )
              }
            />
          </div>
        </div>

        <div className="mx-auto mt-8 max-w-3xl">
          <CommentSection
            postId={post.id}
            postCategoryId={post.category.id}
            comments={comments}
            onChanged={loadComments}
          />
        </div>
      </div>

      {zoomed && post.imageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/90 p-4 backdrop-blur-sm"
          onClick={() => setZoomed(false)}
          role="dialog"
          aria-modal="true"
          aria-label="الصورة مكبّرة"
        >
          <img
            src={cloudinaryUrl(post.imageUrl, 1600)}
            alt={post.title}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-full rounded-2xl object-contain shadow-2xl"
          />
          <button
            onClick={() => setZoomed(false)}
            className="absolute top-4 left-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25"
            aria-label="إغلاق"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
      )}
    </article>
  );
}
