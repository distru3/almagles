import { Link } from 'react-router-dom';
import { MessageSquare, Sparkles } from 'lucide-react';
import type { Post } from '../lib/types';
import { hijriDate, gregorianLong } from '../lib/dates';
import { cloudinaryUrl } from '../lib/image';
import AyahText from './AyahText';

const arNumber = new Intl.NumberFormat('ar-EG');

/** Editorial post entry: category, title, excerpt, meta. `featured` is the lead story. */
export default function PostCard({ post, featured = false }: { post: Post; featured?: boolean }) {
  const totalReactions = Object.values(post.reactionCounts ?? {}).reduce((s, v) => s + v, 0);
  const image = post.imageUrl ? cloudinaryUrl(post.imageUrl, featured ? 1100 : 700) : null;

  return (
    <article className={`group flex flex-col ${featured ? 'border-b border-line pb-8' : ''}`}>
      {image && (
        <Link to={`/post/${post.id}`} className="mb-4 block overflow-hidden rounded-sm" tabIndex={-1} aria-hidden="true">
          <img
            src={image}
            alt=""
            loading="lazy"
            className="aspect-[16/9] w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        </Link>
      )}
      <Link to={`/category/${post.category.slug}`} className="self-start font-display text-sm text-accent hover:text-accent-strong">
        {post.category.name}
      </Link>
      <h3
        className={`mt-1 font-display font-semibold text-fg transition group-hover:text-accent ${
          featured ? 'text-[30px] leading-[1.35] sm:text-[34px]' : 'text-[22px] leading-[1.4]'
        }`}
      >
        <Link to={`/post/${post.id}`}>{post.title}</Link>
      </h3>
      <p
        className={`mt-2.5 text-fg-2 ${
          featured ? 'line-clamp-4 text-[19px] leading-[2]' : 'line-clamp-2 text-[16px] leading-[1.9]'
        }`}
      >
        <AyahText text={post.description} />
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        <span title={gregorianLong(post.postDate)}>{hijriDate(post.postDate)}</span>
        <span>{post.author.name}</span>
        {totalReactions > 0 && (
          <span className="inline-flex items-center gap-1" aria-label={`${totalReactions} تفاعل`}>
            <Sparkles className="h-3.5 w-3.5" />
            {arNumber.format(totalReactions)}
          </span>
        )}
        <span className="inline-flex items-center gap-1" aria-label={`${post.commentsCount} تعليق`}>
          <MessageSquare className="h-3.5 w-3.5" />
          {arNumber.format(post.commentsCount)}
        </span>
      </div>
    </article>
  );
}
