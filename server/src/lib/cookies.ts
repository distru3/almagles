import type { Response } from 'express';
import { env, isProd } from '../env.js';

export function setAccessCookie(res: Response, token: string): void {
  res.cookie('alm_access', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: env.ACCESS_TTL_MINUTES * 60 * 1000,
  });
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie('alm_refresh', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: env.REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie('alm_access', { path: '/' });
  res.clearCookie('alm_refresh', { path: '/api/auth' });
}

export function setCsrfCookie(res: Response, token: string): void {
  res.cookie('alm_csrf', token, {
    httpOnly: false,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000,
  });
}
