/**
 * Upload ceiling after compression. The host (Vercel) rejects request bodies
 * over 4.5 MB, and the form fields share that budget with the image.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

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
    // Browsers without WebP encoding silently return PNG; fall back to JPEG instead.
    let blob = await encode('image/webp');
    if (!blob || blob.type !== 'image/webp') blob = await encode('image/jpeg');
    return blob ?? file;
  } finally {
    bitmap.close();
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