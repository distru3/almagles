import { prisma } from '../db.js';
import { env } from '../env.js';
import { generateRefreshToken, hashRefreshToken } from './tokens.js';

/**
 * Browser tabs share one refresh cookie, so two tabs whose access tokens lapse
 * together both present the same refresh token. A rotated token stays valid
 * for this long so the slower tab doesn't get logged out.
 */
const ROTATION_GRACE_MS = 30 * 1000;

/** Most concurrent sessions (devices/browsers) kept per user; oldest go first. */
const MAX_SESSIONS_PER_USER = 10;

function expiryFromNow(): Date {
  return new Date(Date.now() + env.REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/** Drop this user's expired tokens, rotated tokens past the grace window, and sessions over the cap. */
async function pruneUserSessions(userId: string): Promise<void> {
  const now = Date.now();
  await prisma.refreshToken.deleteMany({
    where: {
      userId,
      OR: [{ expiresAt: { lt: new Date(now) } }, { rotatedAt: { lt: new Date(now - ROTATION_GRACE_MS) } }],
    },
  });
  const overflow = await prisma.refreshToken.findMany({
    where: { userId, rotatedAt: null },
    orderBy: { createdAt: 'desc' },
    skip: MAX_SESSIONS_PER_USER,
    select: { id: true },
  });
  if (overflow.length > 0) {
    await prisma.refreshToken.deleteMany({ where: { id: { in: overflow.map((t) => t.id) } } });
  }
}

/** Start a session; returns the raw token for the cookie. */
export async function createSession(userId: string): Promise<string> {
  const { raw, hash } = generateRefreshToken();
  await prisma.refreshToken.create({ data: { tokenHash: hash, userId, expiresAt: expiryFromNow() } });
  await pruneUserSessions(userId);
  return raw;
}

/**
 * Exchange a refresh token for a new one. Returns the user id and new raw
 * token, or null when the token is unknown, expired, or was rotated longer
 * ago than the grace window.
 */
export async function rotateSession(raw: string): Promise<{ userId: string; raw: string } | null> {
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash: hashRefreshToken(raw) } });
  const now = Date.now();
  if (!record || record.expiresAt.getTime() <= now) return null;
  if (record.rotatedAt && now - record.rotatedAt.getTime() > ROTATION_GRACE_MS) return null;

  if (!record.rotatedAt) {
    // Only the first concurrent request stamps rotatedAt; later ones were
    // already admitted by the grace-window check above.
    await prisma.refreshToken.updateMany({
      where: { id: record.id, rotatedAt: null },
      data: { rotatedAt: new Date(now) },
    });
  }

  const next = await createSession(record.userId);
  return { userId: record.userId, raw: next };
}

/** End one session (logout). */
export async function revokeSession(raw: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { tokenHash: hashRefreshToken(raw) } });
}

/** End every session for a user (password reset). */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { userId } });
}
