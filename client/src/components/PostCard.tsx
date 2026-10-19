import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, MessageCircle, Share2 } from 'lucide-react';
import type { Post } from '../lib/types';
import { hijriDate } from '../lib/dates';
import { cloudinaryUrl } from '../lib/image';
import RichText from './RichText';
import Avatar from './Avatar';
import { LinkPreviewCard, PostVideo } from './PostMedia';
import { REACTIONS, arNumber, useReaction } from './reactions';

const relative = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' });

/** "منذ ٣ ساعات" for the last week, the Hijri date after that. */
function timeAgo(createdAt: string, postDate: string): string {
  const seconds = (Date.now() - new Date(createdAt).getTime()) / 1000;
  if (seconds < 60) return 'الآن';
  if (seconds < 3600) return relative.format(-Math.floor(seconds / 60), 'minute');
  if (seconds < 86400) return relative.format(-Math.floor(seconds / 3600), 'hour');
  if (seconds < 7 * 86400) return relative.format(-Math.floor(seconds / 86400), 'day');
  return hijriDate(postDate);
}

const ROLE_BADGE: Record<string, string> = { writer: 'كاتب', admin: 'مشرف' };

function commentsLabel(n: number): string {
  if (n === 0) return '';
  if (n === 1) return 'تعليق واحد';
  if (n === 2) return 'تعليقان';
  return `${arNumber.format(n)} ${n <= 10 ? 'تعليقات' : 'تعليقًا'}`;
}

interface Props {
  post: Post;
  /** Keeps the list's copy in sync after an on-card reaction. */
  onChange?: (post: Post) => void;
}

/** Social-style post card for the feed: author, text, counts, actions, newest comment. */
export default function PostCard({ post, onChange }: Props) {
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();
  const { normalized, mine, total, react, busy, signedIn } = useReaction(
    post.id,
    post.reactionCounts,
    post.myReaction,
    (reactionCounts, myReaction) => onChange?.({ ...post, reactionCounts, myReaction }),
  );
  const image = post.imageUrl ? cloudinaryUrl(post.imageUrl, 1000) : null;
  const href = `/post/${post.id}`;
  const badge = post.author.role ? ROLE_BADGE[post.author.role] : undefined;
  const long = post.description.length > 260;

  const share = async () => {
    const url = `${window.location.origin}${href}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: post.title, url });
      } catch {
        /* cancelled */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: nothing to do */
    }
  };

  /**
   * The whole card opens the post, except its own controls (links, buttons,
   * the video and YouTube player) and when the reader is selecting text.
   */
  const openPost = (e: React.MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('a, button, video, iframe, input, textarea, select, label, [role="button"]')) return;
    if (window.getSelection()?.toString()) return;
    if (e.metaKey || e.ctrlKey || e.button === 1) window.open(href, '_blank', 'noopener');
    else navigate(href);
  };

  const action = 'flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg font-display text-sm transition';

  return (
    <article
      className="cursor-pointer overflow-hidden rounded-2xl border border-line bg-surface transition hover:border-line-strong"
      onClick={openPost}
      onAuxClick={(e) => e.button === 1 && openPost(e)}
    >
      <div className="px-4 pt-4 sm:px-5 sm:pt-5">
        <header className="flex items-center gap-3">
          <Link to={`/u/${post.author.id}`} tabIndex={-1} aria-hidden="true" className="shrink-0">
            <Avatar name={post.author.name} src={post.author.avatarUrl} size="md" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 font-display text-[15px]">
              <Link to={`/u/${post.author.id}`} className="truncate hover:text-accent">
                {post.author.name}
              </Link>
              {badge && <span className="shrink-0 rounded-full bg-accent-soft px-2 text-[11px] text-accent">{badge}</span>}
            </p>
            <p className="text-[13px] text-muted">
              <Link to={`/category/${post.category.slug}`} className="text-accent hover:text-accent-strong">
                {post.category.name}
              </Link>{' '}
              · <time dateTime={post.createdAt} title={hijriDate(post.postDate)}>{timeAgo(post.createdAt, post.postDate)}</time>
            </p>
          </div>
        </header>

        <h3 className="mt-3.5 font-display text-[21px] font-semibold leading-[1.4] sm:text-[22px]">
          <Link to={href} className="hover:text-accent">
            {post.title}
          </Link>
        </h3>
        <p className="mt-1.5 line-clamp-4 whitespace-pre-line text-[16px] leading-[1.95] text-fg-2 [overflow-wrap:anywhere] sm:text-[17px]">
          <RichText text={post.description} />
        </p>
        {long && (
          <Link to={href} className="mt-1 inline-block font-display text-sm text-accent hover:text-accent-strong">
            اقرأ المزيد
          </Link>
        )}
      </div>

      {post.videoUrl ? (
        <PostVideo post={post} className="mt-3" />
      ) : image ? (
        <Link to={href} className="mt-3 block" tabIndex={-1} aria-hidden="true">
          <img src={image} alt="" loading="lazy" className="max-h-[420px] w-full object-cover" />
        </Link>
      ) : post.linkPreviews?.[0] ? (
        // Like a social feed: a post with no media of its own shows its first link.
        <div className="mt-3 px-4 sm:px-5">
          <LinkPreviewCard preview={post.linkPreviews[0]} compact={post.linkPreviews[0].kind !== 'youtube'} />
        </div>
      ) : null}

      <div className="px-4 sm:px-5">
        <div className="flex items-center justify-between py-3 text-[13px] text-muted">
          <span>{total > 0 ? `${arNumber.format(total)} تفاعل` : 'كن أول من يتفاعل'}</span>
          {post.commentsCount > 0 && (
            <Link to={`${href}#comments`} className="hover:text-fg">
              {commentsLabel(post.commentsCount)}
            </Link>
          )}
        </div>

        <div className="flex gap-1 border-t border-line py-1.5" role="group" aria-label="التفاعل مع المنشور">
          {REACTIONS.map(({ key, label, icon: Icon }) => {
            const active = mine === key;
            const count = normalized[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => react(key)}
                disabled={busy}
                aria-pressed={active}
                aria-label={`${label}${count ? ` (${arNumber.format(count)})` : ''}`}
                title={signedIn ? label : 'سجّل الدخول للتفاعل'}
                className={`${action} ${active ? 'bg-accent-soft font-semibold text-accent' : 'text-fg-2 hover:bg-surface-2 hover:text-fg'}`}
              >
                <Icon className={`h-[17px] w-[17px] ${active ? 'fill-current' : ''}`} aria-hidden="true" />
                <span className="hidden sm:inline">{label}</span>
                {count > 0 && <span className="text-xs">{arNumber.format(count)}</span>}
              </button>
            );
          })}
          <Link to={`${href}#comments`} className={`${action} text-fg-2 hover:bg-surface-2 hover:text-fg`} aria-label="تعليق">
            <MessageCircle className="h-[17px] w-[17px]" aria-hidden="true" />
            <span className="hidden sm:inline">تعليق</span>
          </Link>
          <button type="button" onClick={share} className={`${action} text-fg-2 hover:bg-surface-2 hover:text-fg`} aria-label={copied ? 'تم نسخ الرابط' : 'مشاركة'}>
            {copied ? <Check className="h-[17px] w-[17px]" aria-hidden="true" /> : <Share2 className="h-[17px] w-[17px]" aria-hidden="true" />}
            <span className="hidden sm:inline">{copied ? 'نُسخ الرابط' : 'مشاركة'}</span>
          </button>
        </div>

        {post.topComment && (
          <div className="border-t border-line pb-4 pt-3">
            <div className="flex gap-2.5">
              <Avatar name={post.topComment.authorName} src={post.topComment.authorAvatarUrl} size="sm" />
              <div className="min-w-0 flex-1 rounded-xl bg-surface-2 px-3 py-2">
                <p className="font-display text-[13px]">{post.topComment.authorName}</p>
                <p className="line-clamp-2 text-[14px] leading-[1.8] text-fg-2">
                  <RichText text={post.topComment.content} ugc />
                </p>
              </div>
            </div>
            {post.commentsCount > 1 && (
              <Link to={`${href}#comments`} className="mt-1.5 block pr-10 font-display text-[13px] text-muted hover:text-fg">
                عرض كل التعليقات ({arNumber.format(post.commentsCount)})
              </Link>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
