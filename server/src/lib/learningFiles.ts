import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { env, isProd } from '../env.js';
import { deletePostImage, isCloudinaryConfigured, uploadLearningPdf } from './cloudinary.js';
import { LOCAL_UPLOADS_DIR } from './postImages.js';

/**
 * PDFs a manager attaches to a «رحلة العلم» lesson. In production they go to
 * Cloudinary; in local development without its keys, to server/uploads/learning
 * (served at /uploads), as post photos do.
 */

export const MAX_LEARNING_FILE_BYTES = Math.round(env.LEARNING_FILE_MAX_MB * 1024 * 1024);

const LOCAL_PREFIX = 'local/';

/** Every PDF starts with "%PDF-"; the browser's MIME type alone proves nothing. */
export function isPdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 1024).includes('%PDF-');
}

/** Only ids this feature issued can be deleted through it. */
export function isLearningFileId(publicId: string): boolean {
  return /^(local\/)?learning\/[A-Za-z0-9_-]+(\.pdf)?$/.test(publicId);
}

export interface StoredFile {
  publicId: string;
  url: string;
  pages: number | null;
}

/** Swappable so tests don't call Cloudinary or write files. */
export const learningFileStore = {
  async upload(buffer: Buffer): Promise<StoredFile> {
    if (!isCloudinaryConfigured()) {
      if (isProd) throw new Error('خدمة الملفات غير مكوّنة على الخادم');
      const name = `learning/${randomBytes(12).toString('base64url')}.pdf`;
      await fs.mkdir(path.join(LOCAL_UPLOADS_DIR, 'learning'), { recursive: true });
      await fs.writeFile(path.join(LOCAL_UPLOADS_DIR, name), buffer);
      return { publicId: LOCAL_PREFIX + name, url: `/uploads/${name}`, pages: null };
    }
    const u = await uploadLearningPdf(buffer);
    return { publicId: u.publicId, url: u.secureUrl, pages: u.pages };
  },

  async remove(publicId: string): Promise<void> {
    if (publicId.startsWith(LOCAL_PREFIX)) {
      const file = path.join(LOCAL_UPLOADS_DIR, publicId.slice(LOCAL_PREFIX.length));
      // Only ever inside the uploads folder.
      if (file.startsWith(LOCAL_UPLOADS_DIR + path.sep)) await fs.rm(file, { force: true });
      return;
    }
    await deletePostImage(publicId);
  },
};
