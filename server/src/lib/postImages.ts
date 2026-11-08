import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { isProd } from '../env.js';
import { deletePostImage, isCloudinaryConfigured, uploadPostImage } from './cloudinary.js';
import { optimizeImage } from './image.js';

/** Most photos one post can carry. */
export const MAX_POST_IMAGES = 10;

export interface StoredImage {
  publicId: string;
  url: string;
  width: number | null;
  height: number | null;
}

/**
 * Local development without Cloudinary keys: photos go to server/uploads and
 * are served at /uploads, so posts with images can still be tried out.
 */
export const LOCAL_UPLOADS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads');
const LOCAL_PREFIX = 'local/';

function useLocalDisk(): boolean {
  return !isCloudinaryConfigured() && !isProd;
}

async function saveLocally(buffer: Buffer): Promise<{ publicId: string; url: string }> {
  const name = `posts/${randomBytes(12).toString('base64url')}.webp`;
  await fs.mkdir(path.join(LOCAL_UPLOADS_DIR, 'posts'), { recursive: true });
  await fs.writeFile(path.join(LOCAL_UPLOADS_DIR, name), buffer);
  return { publicId: LOCAL_PREFIX + name, url: `/uploads/${name}` };
}

/** Swappable so tests don't call Cloudinary or write files. */
export const postImageStore = {
  async upload(original: Buffer): Promise<StoredImage> {
    const optimized = await optimizeImage(original);
    const { width = null, height = null } = await sharp(optimized).metadata();
    const stored = useLocalDisk() ? await saveLocally(optimized) : await uploadPostImage(optimized).then((u) => ({ publicId: u.publicId, url: u.secureUrl }));
    return { ...stored, width, height };
  },

  async remove(publicId: string): Promise<void> {
    if (!publicId) return;
    if (publicId.startsWith(LOCAL_PREFIX)) {
      const file = path.join(LOCAL_UPLOADS_DIR, publicId.slice(LOCAL_PREFIX.length));
      // Only ever inside the uploads folder.
      if (file.startsWith(LOCAL_UPLOADS_DIR + path.sep)) await fs.rm(file, { force: true });
      return;
    }
    await deletePostImage(publicId);
  },
};

/** Removes stored files; never throws (a leftover file is harmless, a failed request is not). */
export async function removeStoredImages(publicIds: string[]): Promise<void> {
  await Promise.all(publicIds.map((id) => postImageStore.remove(id).catch(() => undefined)));
}
