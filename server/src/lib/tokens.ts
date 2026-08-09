import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../env.js';

export interface AccessPayload {
  uid: string;
  role: string;
}

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (decoded && typeof decoded === 'object' && typeof (decoded as any).uid === 'string') {
      return {
        uid: (decoded as any).uid as string,
        role: String((decoded as any).role ?? 'visitor'),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function generateRefreshToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(48).toString('base64url');
  return { raw, hash: hashRefreshToken(raw) };
}

export function hashRefreshToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}
