import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThumbsUp, Heart, Lightbulb } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export type ReactionType = 'like' | 'love' | 'insight';

export const REACTIONS: { key: ReactionType; label: string; icon: typeof ThumbsUp }[] = [
  { key: 'like', label: 'إعجاب', icon: ThumbsUp },
  { key: 'love', label: 'تقدير', icon: Heart },
  { key: 'insight', label: 'فائدة', icon: Lightbulb },
];

export const arNumber = new Intl.NumberFormat('ar-EG');

/** Old emoji reaction types still stored on some rows, mapped to the current three. */
const LEGACY_MAP: Record<string, ReactionType> = {
  '👍': 'like',
  '❤️': 'love',
  '💗': 'love',
  '😮': 'insight',
  '😢': 'insight',
  like: 'like',
  love: 'love',
  insight: 'insight',
};

function normalizeCounts(raw: Record<string, number>): Record<ReactionType, number> {
  const out: Record<ReactionType, number> = { like: 0, love: 0, insight: 0 };
  for (const [key, count] of Object.entries(raw ?? {})) {
    const target = LEGACY_MAP[key];
    if (target) out[target] += count;
  }
  return out;
}

/**
 * Reacting to a post: optimistic update, server confirmation, rollback on
 * failure. Shared by the post page's ReactionBar and the feed card.
 */
export function useReaction(
  postId: string,
  counts: Record<string, number>,
  myReaction: string | null,
  onChange?: (counts: Record<string, number>, myReaction: string | null) => void,
) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const normalized = useMemo(() => normalizeCounts(counts), [counts]);
  const mine = myReaction ? (LEGACY_MAP[myReaction] ?? null) : null;
  const total = Object.values(normalized).reduce((sum, v) => sum + v, 0);

  const react = async (type: ReactionType) => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (busy) return;

    const prevCounts = { ...counts };
    const prevMine = myReaction;
    const removing = mine === type;
    const next = { ...normalized };
    if (removing) {
      next[type] = Math.max(0, next[type] - 1);
    } else {
      if (mine) next[mine] = Math.max(0, next[mine] - 1);
      next[type] += 1;
    }
    onChange?.(next, removing ? null : type);

    setBusy(true);
    try {
      const res = await api<{ removed: boolean; type: string }>(`/posts/${postId}/reactions`, {
        method: 'PUT',
        body: { type },
      });
      const confirmed = (LEGACY_MAP[res.type] ?? res.type) as ReactionType;
      const final = { ...normalized };
      if (res.removed) {
        final[confirmed] = Math.max(0, final[confirmed] - 1);
        onChange?.(final, null);
      } else {
        if (mine && mine !== confirmed) final[mine] = Math.max(0, final[mine] - 1);
        final[confirmed] += 1;
        onChange?.(final, confirmed);
      }
    } catch {
      onChange?.(prevCounts, prevMine);
    } finally {
      setBusy(false);
    }
  };

  return { normalized, mine, total, react, busy, signedIn: Boolean(user) };
}
