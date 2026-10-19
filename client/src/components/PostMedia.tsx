import { useState } from 'react';
import { ExternalLink, Play } from 'lucide-react';
import type { LinkPreview, Post } from '../lib/types';

/** The post's own video, sized from its stored dimensions so the page doesn't jump while it loads. */
export function PostVideo({ post, className = '' }: { post: Pick<Post, 'videoUrl' | 'videoPosterUrl' | 'videoWidth' | 'videoHeight'>; className?: string }) {
  if (!post.videoUrl) return null;
  const ratio = post.videoWidth && post.videoHeight ? `${post.videoWidth} / ${post.videoHeight}` : '16 / 9';
  return (
    <div className={`overflow-hidden bg-black ${className}`}>
      <video
        src={post.videoUrl}
        poster={post.videoPosterUrl ?? undefined}
        controls
        playsInline
        preload="metadata"
        className="mx-auto block max-h-[75vh] w-full"
        style={{ aspectRatio: ratio }}
      >
        <a href={post.videoUrl}>تنزيل الفيديو</a>
      </video>
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** A YouTube link: the thumbnail until tapped, then the player in place. */
function YouTubeCard({ preview, compact }: { preview: LinkPreview; compact: boolean }) {
  const [playing, setPlaying] = useState(false);
  const id = preview.youtubeId!;
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface-2">
      <div className="relative aspect-video bg-black">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
            title={preview.title ?? 'فيديو يوتيوب'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            // YouTube refuses to play embeds that send no referrer (our pages default to none).
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 h-full w-full"
          />
        ) : (
          <button type="button" onClick={() => setPlaying(true)} className="group absolute inset-0 block h-full w-full" aria-label={`تشغيل: ${preview.title ?? 'فيديو يوتيوب'}`}>
            <img src={preview.image ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" className="h-full w-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center bg-black/10 transition group-hover:bg-black/25">
              <span className="flex h-14 w-20 items-center justify-center rounded-2xl bg-[#e62117] text-white shadow-lg transition group-hover:scale-105">
                <Play className="h-7 w-7 fill-current" aria-hidden="true" />
              </span>
            </span>
          </button>
        )}
      </div>
      <a href={preview.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 px-3.5 py-2.5 hover:bg-surface">
        <span className="min-w-0 flex-1">
          <span className={`block font-display text-fg ${compact ? 'line-clamp-1 text-[14px]' : 'line-clamp-2 text-[15px]'}`}>{preview.title ?? 'فيديو على يوتيوب'}</span>
          <span className="block text-xs text-muted">
            YouTube{preview.description ? ` · ${preview.description}` : ''}
          </span>
        </span>
        <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
      </a>
    </div>
  );
}

/** Any other page: its Open Graph image, title and description as one link. */
function PageCard({ preview, compact }: { preview: LinkPreview; compact: boolean }) {
  const [imageOk, setImageOk] = useState(Boolean(preview.image));
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`group flex overflow-hidden rounded-xl border border-line bg-surface-2 transition hover:border-line-strong ${compact || !imageOk ? 'flex-row' : 'flex-col'}`}
    >
      {imageOk && preview.image && (
        <img
          src={preview.image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImageOk(false)}
          className={compact ? 'h-24 w-24 shrink-0 object-cover sm:h-28 sm:w-36' : 'aspect-[1.91/1] w-full object-cover'}
        />
      )}
      <span className="min-w-0 flex-1 px-3.5 py-2.5">
        <span className="block text-xs text-muted" dir="ltr">
          {preview.siteName && preview.siteName !== hostOf(preview.url) ? `${preview.siteName} · ` : ''}
          {hostOf(preview.url)}
        </span>
        <span className="mt-0.5 line-clamp-2 block font-display text-[15px] leading-snug text-fg group-hover:text-accent">{preview.title}</span>
        {preview.description && !compact && <span className="mt-1 line-clamp-2 block text-sm leading-relaxed text-fg-2">{preview.description}</span>}
      </span>
    </a>
  );
}

export function LinkPreviewCard({ preview, compact = false }: { preview: LinkPreview; compact?: boolean }) {
  return preview.kind === 'youtube' && preview.youtubeId ? <YouTubeCard preview={preview} compact={compact} /> : <PageCard preview={preview} compact={compact} />;
}

export function LinkPreviews({ previews, compact = false, max = 4, className = '' }: { previews?: LinkPreview[] | null; compact?: boolean; max?: number; className?: string }) {
  const list = (previews ?? []).slice(0, max);
  if (list.length === 0) return null;
  return (
    <div className={`space-y-3 ${className}`}>
      {list.map((p) => (
        <LinkPreviewCard key={p.url} preview={p} compact={compact} />
      ))}
    </div>
  );
}
