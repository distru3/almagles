import { api } from './api';

/**
 * Videos are compressed on the writer's device (WebCodecs, via mediabunny),
 * then uploaded straight to Cloudinary in chunks. The server only signs the
 * upload and later stores the video's address — the file never touches our
 * database or our server.
 */

/** Cloudinary's free plan refuses single videos over 100 MB; leave headroom. */
const TARGET_BYTES = 92 * 1024 * 1024;
const AUDIO_BITRATE = 96_000;
/** Below this the picture is too poor to be worth posting; long lectures belong on YouTube. */
const MIN_VIDEO_BITRATE = 280_000;
const CHUNK_BYTES = 6 * 1024 * 1024; // Cloudinary needs ≥5 MB per chunk (except the last)

export class VideoError extends Error {}

export interface CompressedVideo {
  blob: Blob;
  width: number;
  height: number;
  duration: number;
}

export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} ميغابايت` : `${mb.toFixed(1)} ميغابايت`;
}

export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const two = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m % 60)}:${two(s % 60)}` : `${m}:${two(s % 60)}`;
}

/**
 * Re-encode to H.264/AAC MP4 at 720p (480p for long videos), at a bitrate that
 * keeps the whole file under Cloudinary's limit.
 */
export async function compressVideo(
  file: File,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<CompressedVideo> {
  if (typeof VideoEncoder === 'undefined') {
    throw new VideoError('متصفحك لا يدعم ضغط الفيديو — حدّث المتصفح أو استخدم Chrome أو Safari الحديث');
  }
  const mb = await import('mediabunny');
  const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BlobSource(file) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new VideoError('لم يُعثر على صورة فيديو في هذا الملف');
    const duration = (await input.getDurationFromMetadata()) ?? (await input.computeDuration());
    if (!duration || !Number.isFinite(duration)) throw new VideoError('تعذّرت قراءة مدة الفيديو');

    const budget = (TARGET_BYTES * 8) / duration - AUDIO_BITRATE;
    if (budget < MIN_VIDEO_BITRATE) {
      throw new VideoError(
        `الفيديو طويل (${formatDuration(duration)}) — الحد نحو ٣٥ دقيقة. للمحاضرات الطويلة ارفعها على يوتيوب وضع رابطها في المنشور، فيظهر في المنشور مع صورتها.`,
      );
    }
    const long = budget < 900_000;
    const videoBitrate = Math.min(long ? 700_000 : 1_600_000, budget);
    const maxSide = long ? 854 : 1280;

    const w = await track.getDisplayWidth();
    const h = await track.getDisplayHeight();
    const scale = Math.min(1, maxSide / Math.max(w, h));
    // Encoders want even dimensions.
    const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
    const outW = even(w);
    const outH = even(h);

    const audioTrack = await input.getPrimaryAudioTrack();
    const audioCodec = audioTrack ? await audioTrack.getCodec() : null;
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() });
    const conversion = await mb.Conversion.init({
      input,
      output,
      tracks: 'primary',
      showWarnings: false,
      video: { width: outW, height: outH, fit: 'contain', codec: 'avc', quality: new mb.Quality({ bitrate: Math.round(videoBitrate) }), forceTranscode: true },
      // AAC audio (what phones record) is copied as-is; anything else is re-encoded.
      audio: audioCodec === 'aac' ? {} : { codec: 'aac', quality: new mb.Quality({ bitrate: AUDIO_BITRATE }) },
    });
    if (!conversion.isValid) {
      throw new VideoError('متصفحك لا يستطيع ضغط هذا الفيديو — جرّب Chrome على الحاسوب أو الهاتف');
    }
    // Never publish a silent copy of a video that had sound.
    if (audioTrack && conversion.discardedTracks.some((d) => d.track.type === 'audio')) {
      throw new VideoError('متصفحك لا يستطيع ضغط صوت هذا الفيديو — جرّب Chrome');
    }

    const abort = () => void conversion.cancel();
    signal.addEventListener('abort', abort);
    conversion.onProgress = (p) => onProgress(Math.min(1, p));
    try {
      await conversion.execute();
    } finally {
      signal.removeEventListener('abort', abort);
    }
    if (signal.aborted) throw new DOMException('cancelled', 'AbortError');
    const buffer = (output.target as InstanceType<typeof mb.BufferTarget>).buffer;
    if (!buffer) throw new VideoError('تعذّر ضغط الفيديو');
    const blob = new Blob([buffer], { type: 'video/mp4' });
    if (blob.size > 99 * 1024 * 1024) throw new VideoError('الفيديو ما زال كبيراً بعد الضغط — قصّه أو ارفعه على يوتيوب وضع رابطه');
    return { blob, width: outW, height: outH, duration };
  } catch (err) {
    if (signal.aborted || (err instanceof Error && err.name === 'ConversionCanceledError')) {
      throw new DOMException('cancelled', 'AbortError');
    }
    if (err instanceof VideoError) throw err;
    throw new VideoError('تعذّر ضغط هذا الفيديو — تأكد أنه ملف فيديو سليم (MP4 أو MOV)');
  } finally {
    input.dispose();
  }
}

interface Ticket {
  cloudName: string;
  apiKey: string;
  params: Record<string, string>;
}

function sendChunk(url: string, form: FormData, headers: Record<string, string>, onProgress: (loaded: number) => void, signal: AbortSignal) {
  return new Promise<any>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      let body: any = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* not JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(Object.assign(new Error(body?.error?.message ?? `upload failed (${xhr.status})`), { status: xhr.status }));
    };
    xhr.onerror = () => reject(Object.assign(new Error('network'), { status: 0 }));
    const abort = () => xhr.abort();
    signal.addEventListener('abort', abort, { once: true });
    xhr.onabort = () => reject(new DOMException('cancelled', 'AbortError'));
    xhr.send(form);
  });
}

/** Upload in 6 MB chunks, retrying each a few times, so a flaky phone connection doesn't restart a 90 MB upload. */
export async function uploadVideo(blob: Blob, onProgress: (fraction: number) => void, signal: AbortSignal): Promise<string> {
  const ticket = await api<Ticket>('/posts/video-upload', { method: 'POST' });
  const url = `https://api.cloudinary.com/v1_1/${ticket.cloudName}/video/upload`;
  const uploadId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  const total = blob.size;
  let result: any = null;

  for (let start = 0; start < total; start += CHUNK_BYTES) {
    const end = Math.min(start + CHUNK_BYTES, total);
    for (let attempt = 1; ; attempt++) {
      const form = new FormData();
      form.append('file', blob.slice(start, end), 'video.mp4');
      form.append('api_key', ticket.apiKey);
      for (const [k, v] of Object.entries(ticket.params)) form.append(k, v);
      try {
        result = await sendChunk(
          url,
          form,
          { 'X-Unique-Upload-Id': uploadId, 'Content-Range': `bytes ${start}-${end - 1}/${total}` },
          (loaded) => onProgress(Math.min(1, (start + loaded) / total)),
          signal,
        );
        break;
      } catch (err: any) {
        if (signal.aborted || err?.name === 'AbortError') throw new DOMException('cancelled', 'AbortError');
        // Retry network blips and server hiccups, not rejections.
        const retryable = !err?.status || err.status >= 500 || err.status === 429;
        if (!retryable || attempt >= 4) {
          throw new VideoError(err?.status ? `رفض خادم الوسائط الفيديو: ${err.message}` : 'انقطع الاتصال أثناء رفع الفيديو — حاول مرة أخرى');
        }
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }
  if (!result?.public_id) throw new VideoError('لم يكتمل رفع الفيديو');
  onProgress(1);
  return result.public_id as string;
}

/** Remove a video uploaded for a post that was never saved. Best effort. */
export function discardUploadedVideo(publicId: string): void {
  void api(`/posts/video-upload/${publicId.split('/').map(encodeURIComponent).join('/')}`, { method: 'DELETE' }).catch(() => {});
}
