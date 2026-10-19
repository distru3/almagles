import { Globe, Play } from 'lucide-react';
import { findLinks, youtubeId } from '../lib/links';
import { displayUrl } from '../lib/richText';

/** Must match MAX_PREVIEWS on the server (server/src/lib/linkPreview.ts). */
const MAX_PREVIEWS = 4;

/**
 * Under the editor: the links the post will show, exactly as readers' pages
 * will detect them, so a writer sees straight away whether a link was
 * recognised (YouTube ones with their thumbnail).
 */
export default function DetectedLinks({ text }: { text: string }) {
  const unique = [...new Map(findLinks(text).map((l) => [l.href, l])).values()];
  if (unique.length === 0) return null;
  return (
    <div className="mt-2 rounded-xl border border-line bg-surface-2/50 p-2.5" aria-live="polite">
      <p className="mb-2 text-xs text-muted">
        {unique.length === 1 ? 'رابط سيظهر في المنشور' : `${unique.length} روابط ستظهر في المنشور`} — أولها يظهر كبطاقة في الصفحة الرئيسية
      </p>
      <ul className="flex gap-2 overflow-x-auto pb-0.5">
        {unique.slice(0, MAX_PREVIEWS).map((l) => {
          const yt = youtubeId(l.href);
          return (
            <li key={l.href} className="flex w-44 shrink-0 items-center gap-2 rounded-lg border border-line bg-surface p-1.5">
              {yt ? (
                <span className="relative h-9 w-14 shrink-0 overflow-hidden rounded bg-black">
                  <img src={`https://i.ytimg.com/vi/${yt}/default.jpg`} alt="" className="h-full w-full object-cover" />
                  <Play className="absolute inset-0 m-auto h-3.5 w-3.5 fill-white text-white" aria-hidden="true" />
                </span>
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-surface-2 text-muted">
                  <Globe className="h-4 w-4" aria-hidden="true" />
                </span>
              )}
              <span className="min-w-0 text-[11px] leading-tight">
                <span className="block font-bold text-fg">{yt ? 'فيديو يوتيوب' : 'رابط'}</span>
                <span className="block truncate text-muted" dir="ltr">
                  {displayUrl(l.href, 30)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {unique.length > MAX_PREVIEWS && <p className="mt-1.5 text-[11px] text-muted">تظهر بطاقات المعاينة لأول {MAX_PREVIEWS} روابط؛ البقية تبقى روابط قابلة للنقر.</p>}
    </div>
  );
}
