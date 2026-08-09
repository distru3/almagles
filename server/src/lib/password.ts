import argon2 from 'argon2';
import crypto from 'node:crypto';

// OWASP baseline: Argon2id, m=19MiB, t=2, p=1
const OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | null = null;

/**
 * Timing-safe fallback: hash the same dummy password when the user does not
 * exist, so login responses take the same time either way (prevents account
 * enumeration via timing).
 */
export function dummyPasswordHash(): Promise<string> {
  dummy ??= hashPassword(crypto.randomBytes(24).toString('hex'));
  return dummy;
}
