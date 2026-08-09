import cloudinary from 'cloudinary';
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