import sharp from 'sharp';

export const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Re-encode the incoming image to WebP (max 1600px) before sending it to
 * Cloudinary — smaller payload, faster upload, consistent format.
 */
/** Profile photos: a 512px square (the browser already cropped it; this enforces it). */
export async function optimizeAvatar(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 512, height: 512, fit: 'cover', position: 'attention' })
    .webp({ quality: 85 })
    .toBuffer();
}

export async function optimizeImage(buffer: Buffer): Promise<Buffer> {
  // Cap decoded size so a small, highly compressed file can't expand to gigabytes in memory.
  return sharp(buffer, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
}