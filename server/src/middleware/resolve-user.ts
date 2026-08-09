import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/tokens.js';
import { prisma } from '../db.js';

/**
 * Resolves the authenticated user from the httpOnly access-token cookie.
 * Requests with an expired/absent token simply proceed as anonymous; routes
 * that need a login add `requireAuth` afterwards (or `requireAdmin`).
 */
export async function resolveUser(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.alm_access;
  const payload = token ? verifyAccessToken(token) : null;
  if (!payload) {
    return next();
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.uid },
      select: { id: true, name: true, email: true, role: true },
    });
    if (user) req.user = user;
  } catch {
    // Fall through as unauthenticated on DB errors; routes that require auth
    // will respond with 401/403 appropriately.
  }
  next();
}