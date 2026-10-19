import cloudinary from 'cloudinary';
import { randomBytes } from 'node:crypto';
import { env } from '../env.js';

const v2 = cloudinary.v2;
let configured = false;

function getCloud() {
  if (!configured) {
    if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
      return null;
    }
    v2.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
    });
    configured = true;
  }
  return v2;
}

export interface UploadedImage {
  publicId: string;
  secureUrl: string;
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
  );
}

export function uploadPostImage(buffer: Buffer): Promise<UploadedImage> {
  const c = getCloud();
  if (!c) {
    return Promise.reject(new Error('خدمة الصور غير مكوّنة على الخادم'));
  }
  return new Promise((resolve, reject) => {
    const stream = c.uploader.upload_stream(
      { folder: 'posts', resource_type: 'image' },
      (error, result) => {
        if (error) return reject(error);
        if (!result) return reject(new Error('فشل رفع الصورة'));
        resolve({ publicId: result.public_id, secureUrl: result.secure_url });
      },
    );
    stream.end(buffer);
  });
}

export async function deletePostImage(publicId: string): Promise<void> {
  const c = getCloud();
  if (!c) return;
  try {
    await c.uploader.destroy(publicId);
  } catch {
    // Non-fatal: orphaned asset cleanup can be retried from the dashboard.
  }
}
// ── Videos ────────────────────────────────────────────────────────────────
// The browser compresses a video, then uploads it straight to Cloudinary with
// a signature from us (a 95 MB file never passes through this server). The
// post only stores the resulting address.

/** Cloudinary's free plan refuses single videos over 100 MB. */
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

/** Poster frame, generated in the background when the upload arrives. */
const POSTER_TRANSFORM = 'c_limit,so_1,w_1280';

const videoIdPrefix = (userId: string) => `posts/videos/${userId}_`;

/** Whether this video id was issued to this user (see signVideoUpload). */
export function isOwnVideoId(publicId: string, userId: string): boolean {
  const prefix = videoIdPrefix(userId);
  return publicId.startsWith(prefix) && /^[A-Za-z0-9_-]{8,40}$/.test(publicId.slice(prefix.length));
}

export interface VideoUploadTicket {
  cloudName: string;
  apiKey: string;
  /** Exactly the fields to send with the file, signature included. */
  params: Record<string, string>;
}

/** Sign a one-off direct upload of one video under an id tied to this user. */
export function signVideoUpload(userId: string): VideoUploadTicket {
  const c = getCloud();
  if (!c) throw new Error('خدمة الوسائط غير مكوّنة على الخادم');
  const params: Record<string, string> = {
    public_id: videoIdPrefix(userId) + randomBytes(12).toString('base64url'),
    timestamp: String(Math.floor(Date.now() / 1000)),
    eager: `${POSTER_TRANSFORM}/jpg`,
    eager_async: 'true',
    allowed_formats: 'mp4,mov,webm',
  };
  const signature = c.utils.api_sign_request(params, env.CLOUDINARY_API_SECRET!);
  return { cloudName: env.CLOUDINARY_CLOUD_NAME!, apiKey: env.CLOUDINARY_API_KEY!, params: { ...params, signature } };
}

export interface StoredVideo {
  publicId: string;
  url: string;
  posterUrl: string;
  width: number | null;
  height: number | null;
  duration: number | null;
}

/** Look the uploaded video up in Cloudinary; null when it isn't there or is too big. */
export async function findVideo(publicId: string): Promise<StoredVideo | null> {
  const c = getCloud();
  if (!c) return null;
  try {
    const r = await c.api.resource(publicId, { resource_type: 'video' });
    if (typeof r.bytes === 'number' && r.bytes > MAX_VIDEO_BYTES) return null;
    const url: string = r.secure_url;
    const posterUrl = url
      .replace('/video/upload/', `/video/upload/${POSTER_TRANSFORM}/`)
      .replace(/\.[a-z0-9]+$/i, '.jpg');
    return {
      publicId,
      url,
      posterUrl,
      width: r.width ?? null,
      height: r.height ?? null,
      duration: typeof r.duration === 'number' ? r.duration : null,
    };
  } catch {
    return null;
  }
}

export async function deletePostVideo(publicId: string): Promise<void> {
  const c = getCloud();
  if (!c) return;
  try {
    await c.uploader.destroy(publicId, { resource_type: 'video', invalidate: true });
  } catch {
    // Non-fatal, as with images.
  }
}
