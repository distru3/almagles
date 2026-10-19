import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { X, Image as ImageIcon, Loader as LoaderIcon, Video as VideoIcon, RotateCcw, Trash2, CheckCircle2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { prepareImage, ImageError } from '../../lib/image';
import { compressVideo, uploadVideo, discardUploadedVideo, formatBytes, formatDuration, VideoError } from '../../lib/video';
import { todayISO, hijriDate } from '../../lib/dates';
import { useAuth } from '../../context/AuthContext';
import AyahButton, { HadithButton } from '../../components/AyahButton';
import DetectedLinks from '../../components/DetectedLinks';
import type { Category, Post } from '../../lib/types';

interface Props {
  categories: Category[];
  post: Post | null;
  onClose: () => void;
  onSaved: () => void;
}

type VideoState =
  | { status: 'none' }
  | { status: 'existing'; url: string; poster: string | null }
  | { status: 'compressing'; progress: number; name: string; originalSize: number }
  | { status: 'uploading'; progress: number; originalSize: number; size: number }
  | { status: 'ready'; publicId: string; previewUrl: string; originalSize: number; size: number; duration: number }
  | { status: 'error'; message: string };

type ImageState =
  | { status: 'none' }
  | { status: 'existing'; url: string }
  | { status: 'processing' }
  | { status: 'ready'; file: File; previewUrl: string }
  | { status: 'error'; message: string };

const MAX_VIDEO_ORIGINAL = 2 * 1024 * 1024 * 1024;

/** Phones: the sheet fills exactly the area above the on-screen keyboard. */
function useVisibleViewport(enabled: boolean) {
  const [box, setBox] = useState<{ height: number; top: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!enabled || !vv) return setBox(null);
    const update = () => setBox({ height: vv.height, top: vv.offsetTop });
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [enabled]);
  return box;
}

function useIsPhone() {
  const [phone, setPhone] = useState(() => window.matchMedia('(max-width: 639px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}

/** Keep the screen on while a video is being compressed/uploaded (a sleeping phone pauses the page). */
async function holdWakeLock(): Promise<() => void> {
  try {
    const lock = await (navigator as any).wakeLock?.request('screen');
    return () => void lock?.release().catch(() => {});
  } catch {
    return () => {};
  }
}

function Progress({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-fg-2">
        <span>{label}</span>
        <span className="tabular-nums">{Math.round(value * 100)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label={label}>
        <div className="h-full rounded-full bg-accent-fill transition-[width] duration-300" style={{ width: `${Math.max(2, value * 100)}%` }} />
      </div>
    </div>
  );
}

export default function PostFormModal({ categories, post, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const mine = user?.managedCategoryIds ?? [];
  const scoped = user?.role === 'admin' ? categories : categories.filter((c) => mine.includes(c.id));
  const options = post && !scoped.some((c) => c.id === post.category.id) ? [post.category, ...scoped] : scoped;

  const formId = useId();
  const titleId = useId();
  const [title, setTitle] = useState(post?.title ?? '');
  const [description, setDescription] = useState(post?.description ?? '');
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [categoryId, setCategoryId] = useState(post?.category.id ?? options[0]?.id ?? '');
  const [postDate, setPostDate] = useState(post?.postDate ?? todayISO());
  const [image, setImage] = useState<ImageState>(post?.imageUrl ? { status: 'existing', url: post.imageUrl } : { status: 'none' });
  const [video, setVideo] = useState<VideoState>(
    post?.videoUrl ? { status: 'existing', url: post.videoUrl, poster: post.videoPosterUrl ?? null } : { status: 'none' },
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const phone = useIsPhone();
  const viewport = useVisibleViewport(phone);
  const videoJob = useRef<AbortController | null>(null);
  // An uploaded video not yet attached to a saved post; deleted if the form is abandoned.
  const pendingVideo = useRef<string | null>(null);
  const saved = useRef(false);

  const dirty =
    title !== (post?.title ?? '') ||
    description !== (post?.description ?? '') ||
    image.status === 'ready' ||
    (post?.imageUrl ? image.status !== 'existing' : false) ||
    !['none', 'existing'].includes(video.status) ||
    (post?.videoUrl ? video.status !== 'existing' : false);
  const videoBusy = video.status === 'compressing' || video.status === 'uploading';

  const requestClose = useCallback(() => {
    if ((dirty || videoBusy) && !window.confirm('تجاهل ما كتبته وإغلاق النافذة؟')) return;
    onClose();
  }, [dirty, videoBusy, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && requestClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose]);

  // The page behind the sheet must not scroll.
  useEffect(() => {
    const html = document.documentElement;
    const prev = [html.style.overflow, document.body.style.overflow];
    html.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      [html.style.overflow, document.body.style.overflow] = prev;
    };
  }, []);

  // Leaving mid-upload or without saving: stop work and remove the orphaned video.
  useEffect(
    () => () => {
      videoJob.current?.abort();
      if (pendingVideo.current && !saved.current) discardUploadedVideo(pendingVideo.current);
    },
    [],
  );

  // Description grows with its text (up to most of the sheet), so writers see what they type.
  useLayoutEffect(() => {
    const el = descriptionRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, Math.max(200, (viewport?.height ?? window.innerHeight) * 0.6))}px`;
  }, [description, viewport?.height]);

  // On phones, keep the field being typed in visible once the keyboard has opened.
  const onFocusField = (e: React.FocusEvent<HTMLFormElement>) => {
    if (!phone) return;
    const el = e.target as HTMLElement;
    if (!el.matches('input, textarea, select')) return;
    window.setTimeout(() => el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 320);
  };

  // ── Image ──────────────────────────────────────────────────────────────
  const pickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    e.target.value = ''; // picking the same file again should still fire
    if (!selected) return;
    setImage({ status: 'processing' });
    try {
      const file = await prepareImage(selected);
      setImage({ status: 'ready', file, previewUrl: URL.createObjectURL(file) });
    } catch (err) {
      setImage({ status: 'error', message: err instanceof ImageError ? err.message : 'تعذّرت معالجة الصورة' });
    }
  };

  useEffect(() => () => void (image.status === 'ready' && URL.revokeObjectURL(image.previewUrl)), [image]);

  // ── Video ──────────────────────────────────────────────────────────────
  const dropPendingVideo = () => {
    if (pendingVideo.current) discardUploadedVideo(pendingVideo.current);
    pendingVideo.current = null;
  };

  const pickVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.type && !file.type.startsWith('video/')) {
      setVideo({ status: 'error', message: 'هذا الملف ليس فيديو' });
      return;
    }
    if (file.size > MAX_VIDEO_ORIGINAL) {
      setVideo({ status: 'error', message: 'الملف أكبر من ٢ غيغابايت — ارفعه على يوتيوب وضع رابطه في المنشور' });
      return;
    }
    videoJob.current?.abort();
    dropPendingVideo();
    const job = new AbortController();
    videoJob.current = job;
    const release = await holdWakeLock();
    try {
      setVideo({ status: 'compressing', progress: 0, name: file.name, originalSize: file.size });
      const compressed = await compressVideo(file, (p) => setVideo((v) => (v.status === 'compressing' ? { ...v, progress: p } : v)), job.signal);
      setVideo({ status: 'uploading', progress: 0, originalSize: file.size, size: compressed.blob.size });
      const publicId = await uploadVideo(compressed.blob, (p) => setVideo((v) => (v.status === 'uploading' ? { ...v, progress: p } : v)), job.signal);
      pendingVideo.current = publicId;
      setVideo({
        status: 'ready',
        publicId,
        previewUrl: URL.createObjectURL(compressed.blob),
        originalSize: file.size,
        size: compressed.blob.size,
        duration: compressed.duration,
      });
    } catch (err) {
      if (job.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return;
      setVideo({
        status: 'error',
        message: err instanceof VideoError ? err.message : err instanceof ApiError ? err.message : 'تعذّر تجهيز الفيديو — حاول مرة أخرى',
      });
    } finally {
      release();
      if (videoJob.current === job) videoJob.current = null;
    }
  };

  const cancelVideo = () => {
    videoJob.current?.abort();
    dropPendingVideo();
    setVideo(post?.videoUrl ? { status: 'existing', url: post.videoUrl, poster: post.videoPosterUrl ?? null } : { status: 'none' });
  };

  const removeVideo = () => {
    videoJob.current?.abort();
    dropPendingVideo();
    setVideo({ status: 'none' });
  };

  useEffect(() => () => void (video.status === 'ready' && URL.revokeObjectURL(video.previewUrl)), [video]);

  // ── Submit ─────────────────────────────────────────────────────────────
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || videoBusy || image.status === 'processing') return;
    setError(null);

    if (!categoryId) {
      setError('لم تُوكَّل لك أي أقسام للنشر بعد — تواصل مع المشرف العام');
      return;
    }

    const form = new FormData();
    form.append('title', title.trim());
    form.append('description', description.trim());
    form.append('categoryId', categoryId);
    form.append('postDate', postDate);
    if (image.status === 'ready') form.append('image', image.file);
    if (post?.imageUrl && (image.status === 'none' || image.status === 'error')) form.append('removeImage', 'true');
    if (video.status === 'ready') form.append('videoPublicId', video.publicId);
    if (post?.videoUrl && (video.status === 'none' || video.status === 'error')) form.append('removeVideo', 'true');

    setBusy(true);
    try {
      if (post) await api(`/posts/${post.id}`, { method: 'PUT', body: form });
      else await api('/posts', { method: 'POST', body: form });
      saved.current = true;
      pendingVideo.current = null;
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر حفظ المنشور — تحقق من الاتصال وحاول مرة أخرى');
      document.getElementById(formId)?.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = !busy && !videoBusy && image.status !== 'processing' && title.trim() !== '' && description.trim() !== '';
  const submitLabel = videoBusy ? 'انتظر الفيديو…' : post ? 'حفظ' : 'نشر';

  const tile =
    'flex min-h-[5.5rem] flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line-strong bg-surface-2/50 px-3 py-3 text-center text-sm text-accent transition hover:border-accent hover:bg-surface-2 focus-within:border-accent';

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex bg-black/55 backdrop-blur-sm sm:bottom-0 sm:items-center sm:justify-center sm:p-4"
      style={phone && viewport ? { height: viewport.height, top: viewport.top } : { bottom: 0 }}
      onClick={phone ? undefined : requestClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-full w-full flex-col bg-surface sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:overflow-hidden sm:rounded-2xl sm:border sm:border-line sm:shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-line px-2 py-2 sm:px-5 sm:py-3.5">
          <button type="button" onClick={requestClose} className="flex h-11 w-11 items-center justify-center rounded-full text-fg-2 transition hover:bg-surface-2" aria-label="إغلاق">
            <X className="h-5 w-5" />
          </button>
          <h3 id={titleId} className="flex-1 font-display text-lg font-bold text-fg">
            {post ? 'تعديل المنشور' : 'منشور جديد'}
          </h3>
          {/* Phones: the publish button lives up here, always visible above the keyboard. */}
          <button type="submit" form={formId} className="btn-primary !min-h-10 !px-5 sm:hidden" disabled={!canSubmit}>
            {busy && <LoaderIcon className="h-4 w-4 animate-spin" />}
            {submitLabel}
          </button>
        </header>

        <form
          id={formId}
          onSubmit={submit}
          onFocus={onFocusField}
          className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5"
        >
          {error && (
            <p role="alert" className="rounded-xl border border-danger bg-danger-soft px-3.5 py-2.5 text-sm font-bold text-danger">
              {error}
            </p>
          )}

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor={`${formId}-title`} className="label !mb-0">
                العنوان
              </label>
              <span className="text-[11px] text-muted">{title.length}/200</span>
            </div>
            <input
              id={`${formId}-title`}
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                // Enter moves on to the text instead of submitting half a post.
                if (e.key === 'Enter') {
                  e.preventDefault();
                  descriptionRef.current?.focus();
                }
              }}
              enterKeyHint="next"
              placeholder="عنوان المنشور"
              maxLength={200}
              required
            />
          </div>

          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="post-description" className="label !mb-0">
                نص المنشور
              </label>
              <span className="text-[11px] text-muted">{description.length}/20000</span>
            </div>
            <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5" role="toolbar" aria-label="تنسيق النص">
              <AyahButton target={descriptionRef} value={description} onChange={setDescription} />
              <HadithButton target={descriptionRef} value={description} onChange={setDescription} />
            </div>
            <textarea
              id="post-description"
              ref={descriptionRef}
              className="input resize-none overflow-y-auto leading-[1.9]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="اكتب المحتوى هنا… الروابط تصبح قابلة للنقر تلقائياً، وروابط يوتيوب تظهر بصورتها."
              maxLength={20000}
              rows={6}
              required
            />
            <DetectedLinks text={description} />
          </div>

          {/* ── Media ── */}
          <fieldset className="space-y-3">
            <legend className="label">الوسائط (اختياري)</legend>

            {/* Image */}
            {image.status === 'existing' || image.status === 'ready' ? (
              <div className="flex items-center gap-3 rounded-xl border border-line p-2.5">
                <ImagePreview src={image.status === 'ready' ? image.previewUrl : image.url} />
                <div className="flex flex-1 flex-wrap gap-2">
                  <label className="btn-outline !min-h-10 cursor-pointer !px-3.5 !text-sm">
                    <RotateCcw className="h-4 w-4" />
                    تغيير
                    <input type="file" accept="image/*" className="sr-only" onChange={pickImage} />
                  </label>
                  <button type="button" onClick={() => setImage({ status: 'none' })} className="btn-outline !min-h-10 !px-3.5 !text-sm !text-danger">
                    <Trash2 className="h-4 w-4" />
                    إزالة
                  </button>
                </div>
              </div>
            ) : null}

            {/* Video */}
            {video.status === 'compressing' || video.status === 'uploading' ? (
              <div className="space-y-3 rounded-xl border border-line p-3.5" aria-live="polite">
                {video.status === 'compressing' ? (
                  <Progress value={video.progress} label={`ضغط الفيديو (${formatBytes(video.originalSize)})`} />
                ) : (
                  <Progress value={video.progress} label={`رفع الفيديو — ${formatBytes(video.size)} بعد الضغط`} />
                )}
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted">أبقِ هذه الصفحة مفتوحة حتى يكتمل.</p>
                  <button type="button" onClick={cancelVideo} className="btn-outline !min-h-9 !px-3 !text-xs">
                    إلغاء
                  </button>
                </div>
              </div>
            ) : video.status === 'ready' || video.status === 'existing' ? (
              <div className="space-y-2 rounded-xl border border-line p-2.5">
                <video
                  src={video.status === 'ready' ? video.previewUrl : video.url}
                  poster={video.status === 'existing' ? (video.poster ?? undefined) : undefined}
                  controls
                  playsInline
                  preload="metadata"
                  className="max-h-64 w-full rounded-lg bg-black"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {video.status === 'ready' ? (
                    <p className="flex items-center gap-1.5 text-xs text-success">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      {formatDuration(video.duration)} · ضُغط من {formatBytes(video.originalSize)} إلى {formatBytes(video.size)}
                    </p>
                  ) : (
                    <span />
                  )}
                  <div className="flex gap-2">
                    <label className="btn-outline !min-h-10 cursor-pointer !px-3.5 !text-sm">
                      <RotateCcw className="h-4 w-4" />
                      تغيير
                      <input type="file" accept="video/*" className="sr-only" onChange={pickVideo} />
                    </label>
                    <button type="button" onClick={removeVideo} className="btn-outline !min-h-10 !px-3.5 !text-sm !text-danger">
                      <Trash2 className="h-4 w-4" />
                      إزالة
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {(image.status === 'error' || video.status === 'error') && (
              <div role="alert" className="space-y-1 rounded-xl border border-danger/50 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
                {image.status === 'error' && <p>{image.message}</p>}
                {video.status === 'error' && <p>{video.message}</p>}
              </div>
            )}

            {/* Add tiles for whatever isn't attached yet */}
            {(image.status !== 'existing' && image.status !== 'ready') || !['existing', 'ready', 'compressing', 'uploading'].includes(video.status) ? (
              <div className="flex gap-3">
                {image.status !== 'existing' && image.status !== 'ready' && (
                  <label className={tile}>
                    {image.status === 'processing' ? <LoaderIcon className="h-6 w-6 animate-spin" /> : <ImageIcon className="h-6 w-6" />}
                    <span className="font-bold">{image.status === 'processing' ? 'جارٍ تجهيز الصورة…' : 'إضافة صورة'}</span>
                    <span className="text-[11px] text-muted">تُضغط تلقائياً</span>
                    <input type="file" accept="image/*" className="sr-only" onChange={pickImage} disabled={image.status === 'processing'} />
                  </label>
                )}
                {!['existing', 'ready', 'compressing', 'uploading'].includes(video.status) && (
                  <label className={tile}>
                    <VideoIcon className="h-6 w-6" />
                    <span className="font-bold">إضافة فيديو</span>
                    <span className="text-[11px] text-muted">يُضغط قبل الرفع · حتى ~٣٥ دقيقة</span>
                    <input type="file" accept="video/*" className="sr-only" onChange={pickVideo} />
                  </label>
                )}
              </div>
            ) : null}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${formId}-category`} className="label">
                القسم
              </label>
              {options.length === 0 ? (
                <p className="rounded-xl border border-warn bg-warn-soft px-3 py-2 text-xs font-bold text-warn">
                  لم تُوكَّل لك أي أقسام للنشر بعد — تواصل مع المشرف العام.
                </p>
              ) : (
                <select id={`${formId}-category`} className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
                  <option value="" disabled>
                    اختر القسم
                  </option>
                  {options.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor={`${formId}-date`} className="label !mb-0">
                  تاريخ المنشور
                </label>
                {postDate && <span className="text-[11px] font-bold text-accent">{hijriDate(postDate)}</span>}
              </div>
              <input id={`${formId}-date`} type="date" className="input" value={postDate} onChange={(e) => setPostDate(e.target.value)} required />
            </div>
          </div>

          {/* Desktop actions; on phones the header button does this. */}
          <div className="hidden gap-3 border-t border-line/60 pt-4 sm:flex">
            <button type="submit" className="btn-primary flex-1" disabled={!canSubmit}>
              {busy && <LoaderIcon className="h-4 w-4 animate-spin" />}
              <span>{videoBusy ? 'انتظر حتى يكتمل رفع الفيديو' : post ? 'حفظ التعديلات' : 'نشر المنشور'}</span>
            </button>
            <button type="button" onClick={requestClose} className="btn-outline">
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Thumbnail that says so instead of showing a broken image if the browser can't display it. */
function ImagePreview({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (failed) {
    return (
      <span className="flex h-20 w-28 shrink-0 flex-col items-center justify-center gap-1 rounded-lg bg-surface-2 text-center text-[11px] text-muted">
        <ImageIcon className="h-5 w-5" aria-hidden="true" />
        الصورة جاهزة للرفع
      </span>
    );
  }
  return <img src={src} alt="معاينة الصورة" onError={() => setFailed(true)} className="h-20 w-28 shrink-0 rounded-lg object-cover sm:h-24 sm:w-36" />;
}
