import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThumbsUp, Heart, Lightbulb } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export type ReactionType = 'like' | 'love' | 'insight';

const REACTIONS: { key: ReactionType; label: string; icon: typeof ThumbsUp }[] = [
  { key: 'like', label: 'إعجاب', icon: ThumbsUp },
  { key: 'love', label: 'تقدير', icon: Heart },
  { key: 'insight', label: 'فائدة', icon: Lightbulb },
];

const arNumber = new Intl.NumberFormat('ar-EG');

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

function normalizeCounts(rawCounts: Record<string, number>): Record<ReactionType, number> {
  const normalized: Record<ReactionType, number> = {
    like: 0,
    love: 0,
    insight: 0,
  };
  for (const [key, count] of Object.entries(rawCounts ?? {})) {
    const targetKey = LEGACY_MAP[key];
    if (targetKey) {
      normalized[targetKey] = (normalized[targetKey] ?? 0) + count;
    }
  }
  return normalized;
}

interface Props {
  postId: string;
  counts: Record<string, number>;
  myReaction: string | null;
  total?: number;
  onChange?: (counts: Record<string, number>, myReaction: string | null) => void;
}

export default function ReactionBar({ postId, counts, myReaction, onChange }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const normalizedCounts = useMemo(() => normalizeCounts(counts), [counts]);
  const normalizedMyReaction = myReaction ? (LEGACY_MAP[myReaction] ?? null) : null;

  const handleReact = async (type: ReactionType) => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (busy) return;

    // Snapshot previous state for rollback
    const prevCounts = { ...counts };
    const prevMyReaction = myReaction;

    // Optimistic calculation
    const isRemoving = normalizedMyReaction === type;
    const nextNormalized = { ...normalizedCounts };

    if (isRemoving) {
      nextNormalized[type] = Math.max(0, nextNormalized[type] - 1);
    } else {
      if (normalizedMyReaction) {
        nextNormalized[normalizedMyReaction] = Math.max(0, nextNormalized[normalizedMyReaction] - 1);
      }
      nextNormalized[type] = (nextNormalized[type] ?? 0) + 1;
    }

    const nextMyReaction = isRemoving ? null : type;

    // Apply immediately to UI
    onChange?.(nextNormalized, nextMyReaction);

    setBusy(true);
    try {
      const res = await api<{ removed: boolean; type: string }>(`/posts/${postId}/reactions`, {
        method: 'PUT',
        body: { type },
      });

      const confirmedType = (LEGACY_MAP[res.type] ?? res.type) as ReactionType;
      const confirmedCounts = { ...normalizedCounts };

      if (res.removed) {
        confirmedCounts[confirmedType] = Math.max(0, confirmedCounts[confirmedType] - 1);
        onChange?.(confirmedCounts, null);
      } else {
        if (normalizedMyReaction && normalizedMyReaction !== confirmedType) {
          confirmedCounts[normalizedMyReaction] = Math.max(0, confirmedCounts[normalizedMyReaction] - 1);
        }
        confirmedCounts[confirmedType] = (confirmedCounts[confirmedType] ?? 0) + 1;
        onChange?.(confirmedCounts, confirmedType);
      }
    } catch {
      // Rollback on network or server error
      onChange?.(prevCounts, prevMyReaction);
    } finally {
      setBusy(false);
    }
  };

  const totalReactions = Object.values(normalizedCounts).reduce((sum, v) => sum + v, 0);

  return (
    <section aria-label="التفاعل">
      <div className="grid grid-cols-3 gap-2">
        {REACTIONS.map(({ key, label, icon: Icon }) => {
          const active = normalizedMyReaction === key;
          const count = normalizedCounts[key] ?? 0;
          return (
            <button
              key={key}
              type="button"
              onClick={() => handleReact(key)}
              disabled={busy}
              aria-pressed={active}
              title={user ? (active ? `إلغاء ${label}` : label) : 'سجّل الدخول للتفاعل'}
              className={`inline-flex min-h-12 select-none items-center justify-center gap-2 rounded-full border px-3 font-display text-[15px] transition ${
                active
                  ? 'border-accent-fill bg-accent-fill font-semibold text-on-accent'
                  : 'border-line-strong text-fg hover:border-accent hover:text-accent'
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? 'fill-current' : ''}`} aria-hidden="true" />
              <span>{label}</span>
              {count > 0 && (
                <span
                  className={`min-w-6 rounded-full px-1.5 text-sm ${active ? 'bg-on-accent/15' : 'bg-surface-2'}`}
                >
                  {arNumber.format(count)}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-center text-sm text-muted">
        {totalReactions > 0 ? `${arNumber.format(totalReactions)} تفاعل` : 'كن أول من يتفاعل'}
      </p>
    </section>
  );
}
