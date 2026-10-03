import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Calendar, User, X, ZoomIn, Share2, Check, ChevronRight, ChevronLeft } from 'lucide-react';
import { api, ApiError } from '../lib/api';
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
  const [loadFailed, setLoadFailed] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleShare = async () => {
    if (!post) return;
    const shareData = {
      title: post.title,
      text: post.title,
      url: window.location.href,
    };

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch {
        // User cancelled or share failed silently
      }
    } else {
      try {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setToastMessage('تم نسخ رابط المقال بنجاح!');
        setTimeout(() => {
          setCopied(false);
          setToastMessage(null);
        }, 3000);
      } catch {
        setToastMessage('تعذّر نسخ الرابط');
        setTimeout(() => setToastMessage(null), 3000);
      }
    }
  };

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
    setNotFound(false);
    setLoadFailed(false);
    (async () => {
      try {
        const res = await api<Post>(`/posts/${id}`);
        if (active) setPost(res);
      } catch (err) {
        if (!active) return;
        // Only a 404 means the post is gone; anything else is a load failure.
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else setLoadFailed(true);
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

  if (loadFailed) {
    return (
      <div className="container-site py-16">
        <EmptyState icon={Calendar} title="تعذّر تحميل المنشور" description="تحقق من اتصالك ثم أعد تحميل الصفحة" />
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
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-brand-600 hover:text-brand-800 dark:text-brand-400 dark:hover:text-gold-300"
      >
        <ArrowRight className="h-4 w-4 rotate-180" />
        {post.category.name}
      </Link>

      <div className="mx-auto max-w-3xl">
        <div className="card card-editorial overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-7">
            <div className="flex flex-wrap items-center gap-3">
              <Link to={`/category/${post.category.slug}`} className="chip text-xs">
                {post.category.name}
              </Link>
              <span className="text-xs text-stone-400">{hijriDate(post.postDate)}</span>
            </div>
            <button
              type="button"
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200/80 bg-white/70 px-3 py-1.5 text-xs font-bold text-stone-700 shadow-sm transition hover:border-brand-400 hover:text-brand-800 dark:border-brand-800 dark:bg-brand-900/40 dark:text-stone-300 dark:hover:border-brand-600 dark:hover:text-gold-300"
              title="مشاركة المقال"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Share2 className="h-3.5 w-3.5" />
              )}
              <span>{copied ? 'تم النسخ' : 'مشاركة'}</span>
            </button>
          </div>

          <h1 className="px-5 pt-3 font-display text-2xl font-black leading-10 text-brand-950 sm:px-7 sm:text-3xl dark:text-stone-100">
            {post.title}
          </h1>

          <div className="flex flex-wrap items-center gap-4 px-5 py-3 text-sm text-stone-500 sm:px-7 dark:text-stone-400">
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
                className="group relative mx-auto block w-full max-w-xl overflow-hidden rounded-2xl border border-brand-100 shadow-sm dark:border-brand-800"
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

          <div className="border-t border-brand-100 px-5 py-4 sm:px-7 dark:border-brand-800/80">
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

        {(post.prevPost || post.nextPost) && (
          <nav aria-label="التنقل بين المقالات" className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {post.prevPost ? (
              <Link
                to={`/post/${post.prevPost.id}`}
                className="card card-editorial group flex flex-col justify-between p-4 transition-all hover:border-brand-300 hover:shadow-md dark:hover:border-brand-600"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-stone-400 group-hover:text-brand-700 dark:group-hover:text-gold-300">
                  <ChevronRight className="h-4 w-4" />
                  <span>المنشور السابق</span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm font-bold text-brand-950 group-hover:text-brand-700 dark:text-stone-100 dark:group-hover:text-gold-300">
                  {post.prevPost.title}
                </p>
              </Link>
            ) : (
              <div className="hidden sm:block" />
            )}

            {post.nextPost ? (
              <Link
                to={`/post/${post.nextPost.id}`}
                className="card card-editorial group flex flex-col justify-between p-4 transition-all hover:border-brand-300 hover:shadow-md text-left dark:hover:border-brand-600"
              >
                <div className="flex items-center justify-end gap-1.5 text-xs font-bold text-stone-400 group-hover:text-brand-700 dark:group-hover:text-gold-300">
                  <span>المنشور التالي</span>
                  <ChevronLeft className="h-4 w-4" />
                </div>
                <p className="mt-2 line-clamp-2 text-sm font-bold text-brand-950 group-hover:text-brand-700 text-right dark:text-stone-100 dark:group-hover:text-gold-300">
                  {post.nextPost.title}
                </p>
              </Link>
            ) : (
              <div className="hidden sm:block" />
            )}
          </nav>
        )}

        <div className="mx-auto mt-8 max-w-3xl">
          <CommentSection
            postId={post.id}
            postCategoryId={post.category.id}
            postAuthorId={post.author.id}
            comments={comments}
            onChanged={loadComments}
          />
        </div>
      </div>

      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl bg-brand-950 px-4 py-2.5 text-sm font-bold text-white shadow-xl animate-fade-in dark:bg-stone-800 dark:border dark:border-stone-700">
          <Check className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

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
