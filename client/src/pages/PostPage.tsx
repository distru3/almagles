import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Calendar, Share2, Check, ChevronRight, ChevronLeft } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { CommentItem, Post } from '../lib/types';
import { hijriDate, gregorianLong, dateTime, dateTimeTitle } from '../lib/dates';
import ReactionBar from '../components/ReactionBar';
import ImageCollage from '../components/ImageCollage';
import CommentSection from '../components/CommentSection';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import RichText from '../components/RichText';
import Avatar from '../components/Avatar';
import { LinkPreviews, PostVideo } from '../components/PostMedia';

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
  const { hash, key: locationKey } = useLocation();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
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

  // Links from a notification (#comment-…) scroll to that comment and flash it.
  const targetComment = hash.startsWith('#comment-') ? hash.slice('#comment-'.length) : null;
  const targetLoaded = !!targetComment && comments.some((c) => c.id === targetComment);
  useEffect(() => {
    if (!targetLoaded || loading) return;
    const el = document.getElementById(`comment-${targetComment}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('bg-accent-soft');
    const timer = window.setTimeout(() => el.classList.remove('bg-accent-soft'), 2500);
    return () => window.clearTimeout(timer);
  }, [targetComment, targetLoaded, loading, locationKey]);

  // Opened from a notification while already on this post: the comment may be newer than the list.
  // (The first render is skipped: the page loads its comments anyway.)
  const firstLocation = useRef(locationKey);
  useEffect(() => {
    if (locationKey !== firstLocation.current && targetComment && !targetLoaded) loadComments();
  }, [locationKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // The tab (and bookmarks) carry the post's title, as shared links do.
  useEffect(() => {
    if (!post) return;
    const previous = document.title;
    document.title = `${post.title} — رجال الأمة`;
    return () => {
      document.title = previous;
    };
  }, [post?.title]);

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
        <div className="mt-3 flex items-center gap-3">
          <Link to={`/u/${post.author.id}`} tabIndex={-1} aria-hidden="true">
            <Avatar name={post.author.name} src={post.author.avatarUrl} size="md" />
          </Link>
          <p className="text-sm leading-tight text-muted">
            <Link to={`/u/${post.author.id}`} className="block font-display text-[15px] text-fg hover:text-accent">
              {post.author.name}
            </Link>
            <span title={gregorianLong(post.postDate)}>{hijriDate(post.postDate)}</span>
            {' · '}
            <time dateTime={post.createdAt} title={dateTimeTitle(post.createdAt)}>{dateTime(post.createdAt)}</time>
          </p>
        </div>

        {post.images?.length > 0 && (
          <ImageCollage images={post.images} alt={post.title} variant="page" className="mt-7 overflow-hidden rounded-sm border border-line" />
        )}

        {post.videoUrl && <PostVideo post={post} className="mt-7 rounded-sm border border-line" />}

        <div className={`prose-ar mt-7 whitespace-pre-line [overflow-wrap:anywhere] ${TEXT_SIZES[textSize].className}`}>
          <RichText text={post.description} />
        </div>

        <LinkPreviews previews={post.linkPreviews} className="mt-7" />

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

    </article>
  );
}
