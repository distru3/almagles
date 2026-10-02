import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThumbsUp, Heart, Lightbulb } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export type ReactionType = 'like' | 'love' | 'insight';

interface ReactionConfig {
  key: ReactionType;
  label: string;
  icon: typeof ThumbsUp;
  activeColor: string;
  activeBg: string;
  activeBorder: string;
}

const REACTIONS: ReactionConfig[] = [
  {
    key: 'like',
    label: 'إعجاب',
    icon: ThumbsUp,
    activeColor: 'text-brand-700 dark:text-emerald-300',
    activeBg: 'bg-brand-50 dark:bg-emerald-950/50',
    activeBorder: 'border-brand-300 dark:border-emerald-600/70',
  },
  {
    key: 'love',
    label: 'تقدير',
    icon: Heart,
    activeColor: 'text-rose-600 dark:text-rose-300',
    activeBg: 'bg-rose-50 dark:bg-rose-950/50',
    activeBorder: 'border-rose-300 dark:border-rose-700/70',
  },
  {
    key: 'insight',
    label: 'فائدة',
    icon: Lightbulb,
    activeColor: 'text-amber-600 dark:text-amber-300',
    activeBg: 'bg-amber-50 dark:bg-amber-950/50',
    activeBorder: 'border-amber-300 dark:border-amber-700/70',
  },
];

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
    <div className="card card-editorial flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {REACTIONS.map(({ key, label, icon: Icon, activeColor, activeBg, activeBorder }) => {
          const active = normalizedMyReaction === key;
          const count = normalizedCounts[key] ?? 0;
          return (
            <button
              key={key}
              type="button"
              onClick={() => handleReact(key)}
              disabled={busy}
              title={user ? (active ? `إلغاء ${label}` : label) : 'سجّل الدخول للتفاعل'}
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-bold transition duration-200 select-none ${
                active
                  ? `${activeBorder} ${activeBg} ${activeColor} shadow-sm scale-105`
                  : 'border-stone-200 bg-white text-stone-600 hover:border-brand-300 hover:bg-brand-50/70 hover:text-brand-800 dark:border-brand-800/80 dark:bg-[#0d221a] dark:text-stone-300 dark:hover:border-brand-600 dark:hover:bg-[#143528] dark:hover:text-stone-100'
              }`}
            >
              <Icon
                className={`h-4 w-4 transition-transform duration-200 ${
                  active ? 'fill-current scale-110' : 'text-stone-500 dark:text-stone-400'
                }`}
              />
              <span>{label}</span>
              {count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.2 text-xs font-black ${
                    active
                      ? 'bg-white/80 text-brand-950 dark:bg-black/40 dark:text-white'
                      : 'bg-stone-100 text-stone-700 dark:bg-[#173b2d] dark:text-stone-200'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5 text-sm font-bold text-stone-500 dark:text-stone-400">
        <Heart className={`h-4 w-4 ${totalReactions > 0 ? 'fill-rose-500 text-rose-500' : 'text-stone-300 dark:text-stone-600'}`} />
        {totalReactions > 0 ? `${totalReactions} تفاعل` : 'كن أول من يتفاعل'}
      </div>
    </div>
  );
}
