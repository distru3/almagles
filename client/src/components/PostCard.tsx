import { Link } from 'react-router-dom';
import { MessageSquare, Sparkles } from 'lucide-react';
import type { Post } from '../lib/types';
import { hijriDate, gregorianLong } from '../lib/dates';
import { cloudinaryUrl } from '../lib/image';

function reactionPreview(post: Post): string | null {
  const entries = Object.entries(post.reactionCounts ?? {});
  if (entries.length === 0) return null;
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const emojis = entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([e]) => e)
    .join(' ');
  return `${emojis} ${total}`;
}

export default function PostCard({ post, featured = false }: { post: Post; featured?: boolean }) {
  const reactions = reactionPreview(post);
  const image = post.imageUrl ? cloudinaryUrl(post.imageUrl, 800) : null;

  return (
    <article
      className={`card card-editorial group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg ${
        featured ? 'border-brand-300 bg-brand-50/50' : ''
      }`}
    >
      {image && (
        <Link to={`/post/${post.id}`} className="block overflow-hidden">
          <img
            src={image}
            alt={post.title}
            loading="lazy"
            className="aspect-[16/9] w-full object-cover transition duration-500 group-hover:scale-105"
          />
        </Link>
      )}
      <div className={`flex flex-1 flex-col ${featured ? 'p-6 sm:p-8' : 'p-5'}`}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Link to={`/category/${post.category.slug}`} className="chip !py-0.5 text-xs">
            {post.category.name}
          </Link>
          <span className="text-xs font-medium text-stone-400">{hijriDate(post.postDate)}</span>
        </div>

        <h2
          className={`font-display font-extrabold leading-tight text-brand-950 group-hover:text-brand-700 ${
            featured ? 'text-2xl sm:text-3xl' : 'text-lg leading-7'
          }`}
        >
          <Link to={`/post/${post.id}`}>{post.title}</Link>
        </h2>

        <p className={`mt-3 text-stone-600 ${featured ? 'max-w-2xl text-base leading-8' : 'line-clamp-3 text-sm leading-7'}`}>
          {post.description}
        </p>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4 text-sm text-stone-500">
          <div className="flex items-center gap-3">
            {reactions && (
              <span className="inline-flex items-center gap-1 rounded-full bg-gold-100 px-2.5 py-1 text-xs font-bold text-gold-700">
                <Sparkles className="h-3.5 w-3.5" />
                {reactions}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-xs">
              <MessageSquare className="h-3.5 w-3.5" />
              {post.commentsCount}
            </span>
          </div>
          <span className="text-xs text-stone-400" title={gregorianLong(post.postDate)}>
            {post.author.name}
          </span>
        </div>
      </div>
    </article>
  );
}
