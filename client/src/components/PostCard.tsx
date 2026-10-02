import { Link } from 'react-router-dom';
import { MessageSquare, Heart } from 'lucide-react';
import type { Post } from '../lib/types';
import { hijriDate, gregorianLong } from '../lib/dates';
import { cloudinaryUrl } from '../lib/image';

export default function PostCard({ post, featured = false }: { post: Post; featured?: boolean }) {
  const totalReactions = Object.values(post.reactionCounts ?? {}).reduce((s, v) => s + v, 0);
  const image = post.imageUrl ? cloudinaryUrl(post.imageUrl, 800) : null;

  return (
    <article
      className={`card card-editorial group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg ${
        featured ? 'border-brand-300 bg-brand-50/50 dark:border-brand-700/80 dark:bg-brand-900/30' : ''
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
          className={`font-display font-extrabold leading-tight text-brand-950 group-hover:text-brand-700 dark:text-stone-100 dark:group-hover:text-gold-300 ${
            featured ? 'text-2xl sm:text-3xl' : 'text-lg leading-7'
          }`}
        >
          <Link to={`/post/${post.id}`}>{post.title}</Link>
        </h2>

        <p className={`mt-3 text-stone-600 dark:text-stone-300 ${featured ? 'max-w-2xl text-base leading-8' : 'line-clamp-3 text-sm leading-7'}`}>
          {post.description}
        </p>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4 text-sm text-stone-500 dark:text-stone-400">
          <div className="flex items-center gap-3">
            {totalReactions > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 dark:border dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300">
                <Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-500" />
                {totalReactions}
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
