import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Calendar, X, ZoomIn, Share2, Check, ChevronRight, ChevronLeft } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { CommentItem, Post } from '../lib/types';
import { hijriDate, gregorianLong } from '../lib/dates';
import { cloudinaryUrl } from '../lib/image';
import ReactionBar from '../components/ReactionBar';
import CommentSection from '../components/CommentSection';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import AyahText from '../components/AyahText';

const TEXT_SIZES = [
  { label: 'عادي', className: '' },
  { label: 'كبير', className: '!text-[21px] !leading-[2.15]' },
  { label: 'أكبر', className: '!text-[24px] !leading-[2.2]' },
] as const;
const TEXT_SIZE_KEY = 'almagles_text_size';

function readTextSize(): number {
  try {
    const n = Number(localStorage.getItem(TEXT_SIZE_KEY));
    return n >= 0 && n < TEXT_SIZES.length ? n : 0;
  } catch {
    return 0;
  }
}

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
  const [textSize, setTextSize] = useState(readTextSize);

  const cycleTextSize = () => {
    const next = (textSize + 1) % TEXT_SIZES.length;
    setTextSize(next);
    try {
      localStorage.setItem(TEXT_SIZE_KEY, String(next));
    } catch {
      /* private mode: size resets next visit */
    }
  };

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
    <article className="container-site py-10">
      <div className="mx-auto max-w-[720px]">
        <div className="flex items-center justify-between gap-3">
          <Link to={`/category/${post.category.slug}`} className="font-display text-[15px] text-accent hover:text-accent-strong">
            {post.category.name}
          </Link>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={cycleTextSize}
              className="flex h-11 min-w-11 items-center justify-center rounded-full px-2 font-display text-fg-2 transition hover:bg-surface-2 hover:text-fg"
              aria-label={`حجم الخط: ${TEXT_SIZES[textSize].label}`}
              title="حجم الخط"
            >
              <span className="text-[17px]">أ</span>
              <span className="text-[12px]">أ</span>
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="flex h-11 w-11 items-center justify-center rounded-full text-fg-2 transition hover:bg-surface-2 hover:text-fg"
              aria-label={copied ? 'تم نسخ الرابط' : 'مشاركة'}
              title="مشاركة"
            >
              {copied ? <Check className="h-[18px] w-[18px]" /> : <Share2 className="h-[18px] w-[18px]" />}
            </button>
          </div>
        </div>

        <h1 className="mt-2 font-display text-[32px] font-semibold leading-[1.4] sm:text-[40px]">{post.title}</h1>
        <p className="mt-2 flex flex-wrap gap-x-3 text-sm text-muted">
          <span title={gregorianLong(post.postDate)}>{hijriDate(post.postDate)}</span>
          <span aria-hidden="true">·</span>
          <span>{post.author.name}</span>
        </p>

        {image && (
          <button
            type="button"
            onClick={() => setZoomed(true)}
            className="group relative mt-7 block w-full overflow-hidden rounded-sm border border-line"
            aria-label="تكبير الصورة"
          >
            <img src={image} alt={post.title} className="w-full object-contain" />
            <span className="absolute bottom-3 left-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition group-hover:opacity-100">
              <ZoomIn className="h-5 w-5" />
            </span>
          </button>
        )}

        <div className={`prose-ar mt-7 whitespace-pre-line ${TEXT_SIZES[textSize].className}`}>
          <AyahText text={post.description} />
        </div>

        <div className="mt-10">
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

        <div className="mt-12">
          <CommentSection
            postId={post.id}
            postCategoryId={post.category.id}
            postAuthorId={post.author.id}
            comments={comments}
            onChanged={loadComments}
          />
        </div>

        {(post.prevPost || post.nextPost) && (
          <nav aria-label="منشورات القسم" className="mt-12 flex justify-between gap-6 border-t border-line pt-6">
            {post.prevPost ? (
              <Link to={`/post/${post.prevPost.id}`} className="group min-w-0">
                <span className="flex items-center gap-1 text-sm text-muted">
                  <ChevronRight className="h-4 w-4" />
                  السابق
                </span>
                <span className="mt-1 line-clamp-2 font-display text-[17px] text-fg group-hover:text-accent">{post.prevPost.title}</span>
              </Link>
            ) : (
              <span />
            )}
            {post.nextPost ? (
              <Link to={`/post/${post.nextPost.id}`} className="group min-w-0 text-left">
                <span className="flex items-center justify-end gap-1 text-sm text-muted">
                  التالي
                  <ChevronLeft className="h-4 w-4" />
                </span>
                <span className="mt-1 line-clamp-2 font-display text-[17px] text-fg group-hover:text-accent">{post.nextPost.title}</span>
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </div>

      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-fg px-5 py-2.5 font-display text-sm text-canvas shadow-xl">
          <Check className="h-4 w-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {zoomed && post.imageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
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
