import type { Request, Response, NextFunction } from 'express';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function notFoundApi(req: Request, res: Response) {
  res.status(404).json({ message: 'المسار غير موجود' });
}

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err);

  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message });
  }

  const status = (err as any)?.status;
  const message = (err as any)?.message;

  // Multer file errors
  if (message?.startsWith('File too large')) {
    return res.status(413).json({ message: 'حجم الصورة يتجاوز الحد المسموح (١٠ ميغابايت)' });
  }
  if ((err as any)?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ message: 'حجم الصورة يتجاوز الحد المسموح (١٠ ميغابايت)' });
  }
  if ((err as any)?.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ message: 'يُسمح بملف صورة واحد فقط' });
  }

  console.error('[server error]', err);
  res.status(500).json({ message: 'حدث خطأ غير متوقع في الخادم' });
}