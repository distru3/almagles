/** Client-side compression: downscale large phone photos before upload. */
export async function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);

    const encode = (type: string) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    // Browsers without WebP encoding (older Safari) silently return PNG,
    // which is far larger than JPEG for photos — fall back to JPEG instead.
    let blob = await encode('image/webp');
    if (!blob || blob.type !== 'image/webp') blob = await encode('image/jpeg');
    return blob ?? file;
  } finally {
    bitmap.close();
  }
}

export class ImageError extends Error {}

/** Originals can be big (phone cameras); what we upload is the compressed copy. */
const MAX_ORIGINAL_BYTES = 40 * 1024 * 1024;
/** The server's limit for the compressed upload. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const UPLOADABLE = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Turn whatever the writer picked (a 12 MB phone photo, an iPhone HEIC, a
 * screenshot) into a ≤1600px WebP/JPEG the server accepts, with a friendly
 * error when the browser can't read it.
 */
export async function prepareImage(file: File): Promise<File> {
  if (file.type && !file.type.startsWith('image/')) throw new ImageError('هذا الملف ليس صورة');
  if (file.size > MAX_ORIGINAL_BYTES) throw new ImageError('الصورة كبيرة جداً (أكثر من ٤٠ ميغابايت)');
  const heic = /hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
  try {
    const blob = await compressImage(file);
    const ext = blob.type === 'image/webp' ? '.webp' : blob.type === 'image/png' ? '.png' : '.jpg';
    const out = new File([blob], (file.name.replace(/\.[^.]+$/, '') || 'image') + ext, { type: blob.type || 'image/jpeg' });
    if (!UPLOADABLE.includes(out.type)) throw new Error('unexpected output type');
    if (out.size > MAX_UPLOAD_BYTES) throw new ImageError('تعذّر تصغير الصورة بما يكفي — اختر صورة أصغر');
    return out;
  } catch (err) {
    if (err instanceof ImageError) throw err;
    // Couldn't decode/re-encode here (very old browser): send the original if the server can take it.
    if (UPLOADABLE.includes(file.type) && file.size <= MAX_UPLOAD_BYTES) return file;
    throw new ImageError(
      heic
        ? 'لا يستطيع هذا المتصفح قراءة صور HEIC — افتح الصفحة في Safari، أو غيّر إعداد الكاميرا إلى «الأكثر توافقاً»'
        : 'تعذّرت قراءة هذه الصورة — جرّب صورة أخرى (JPG أو PNG)',
    );
  }
}

/** Resize a Cloudinary secure URL to a nice display size using on-the-fly transforms. */
export function cloudinaryUrl(secureUrl: string, w = 900, q = 'auto', f = 'auto'): string {
  if (!secureUrl) return secureUrl;
  const marker = '/image/upload/';
  const idx = secureUrl.indexOf(marker);
  if (idx === -1) return secureUrl;
  return secureUrl.slice(0, idx + marker.length) + `w_${w},q_${q},f_${f}/` + secureUrl.slice(idx + marker.length);
}