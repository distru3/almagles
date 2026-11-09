import { z } from 'zod';
import { prisma } from '../db.js';

/** Stored type → one of the three current reactions (old rows kept emoji types). */
export const CANONICAL_REACTIONS: Record<string, string> = {
  like: 'like',
  love: 'love',
  insight: 'insight',
  '👍': 'like',
  '❤️': 'love',
  '💗': 'love',
  '😮': 'insight',
  '😢': 'insight',
};

/** Every stored spelling of a current reaction, for filtering by type. */
function storedTypes(type: string): string[] {
  return Object.keys(CANONICAL_REACTIONS).filter((k) => CANONICAL_REACTIONS[k] === type);
}

export const reactorsQuery = z.object({
  type: z.enum(['like', 'love', 'insight']).optional(),
  cursor: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

export type ReactorsQuery = z.infer<typeof reactorsQuery>;

const USER = { select: { id: true, name: true, avatarUrl: true, role: true } } as const;

interface Row {
  id: string;
  type: string;
  createdAt: Date;
  user: { id: string; name: string; avatarUrl: string | null; role: string };
}

function shape(rows: Row[], limit: number) {
  const page = rows.slice(0, limit);
  return {
    users: page.map((r) => ({
      id: r.user.id,
      name: r.user.name,
      avatarUrl: r.user.avatarUrl,
      role: r.user.role,
      type: CANONICAL_REACTIONS[r.type] ?? r.type,
      reactedAt: r.createdAt,
    })),
    nextCursor: rows.length > limit ? page[page.length - 1].id : null,
  };
}

function countsOf(grouped: { type: string; _count: { _all: number } }[]) {
  const counts: Record<string, number> = { like: 0, love: 0, insight: 0 };
  for (const g of grouped) {
    const t = CANONICAL_REACTIONS[g.type];
    if (t) counts[t] += g._count._all;
  }
  return counts;
}

// Newest first; the id breaks ties so paging never skips or repeats a row.
const ORDER = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];

/** Who reacted to a post, newest first, with per-type counts for the tabs. */
export async function postReactors(postId: string, { type, cursor, limit }: ReactorsQuery) {
  const where = { postId, ...(type ? { type: { in: storedTypes(type) } } : {}) };
  const [rows, grouped] = await Promise.all([
    prisma.reaction.findMany({
      where,
      orderBy: ORDER,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, type: true, createdAt: true, user: USER },
    }),
    // Counts only on the first page: the tabs don't change while scrolling.
    cursor ? Promise.resolve(null) : prisma.reaction.groupBy({ by: ['type'], where: { postId }, _count: { _all: true } }),
  ]);
  return { ...shape(rows, limit), ...(grouped ? { counts: countsOf(grouped) } : {}) };
}

/** Same as postReactors, for a comment or reply. */
export async function commentReactors(commentId: string, { type, cursor, limit }: ReactorsQuery) {
  const where = { commentId, ...(type ? { type: { in: storedTypes(type) } } : {}) };
  const [rows, grouped] = await Promise.all([
    prisma.commentReaction.findMany({
      where,
      orderBy: ORDER,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, type: true, createdAt: true, user: USER },
    }),
    cursor
      ? Promise.resolve(null)
      : prisma.commentReaction.groupBy({ by: ['type'], where: { commentId }, _count: { _all: true } }),
  ]);
  return { ...shape(rows, limit), ...(grouped ? { counts: countsOf(grouped) } : {}) };
}
