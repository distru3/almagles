import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { setCsrfCookie } from '../lib/cookies.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit CSRF protection: every unsafe (mutating) request must echo
 * the value of the `alm_csrf` cookie in the `X-CSRF-Token` header.
 */
export function csrfProtect(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) {
    if (!req.cookies?.alm_csrf) issueCsrf(req, res, next);
    else next();
    return;
  }
  const header = req.headers['x-csrf-token'];
  const cookie = req.cookies?.alm_csrf;
  if (!cookie || !header || header !== cookie) {
    return res.status(403).json({ message: 'طلب محظور — رمز الحماية غير صالح' });
  }
  next();
}

export function issueCsrf(_req: Request, res: Response, next: NextFunction) {
  const token = crypto.randomBytes(24).toString('hex');
  setCsrfCookie(res, token);
  res.locals.csrf = token;
  next();
}