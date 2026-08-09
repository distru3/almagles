import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const REACTION_TYPES = ['👍', '❤️', '💗', '😮', '😢'];
const REACTION_LABELS: Record<string, string> = {
  '👍': 'إعجاب',
  '❤️': 'حب',
  '💗': 'اهتمام',
  '😮': 'مدهش',
  '😢': 'حزين',
};

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

  const handleReact = async (type: string) => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const res = await api<{ removed: boolean; type: string }>(`/posts/${postId}/reactions`, {
        method: 'PUT',
        body: { type },
      });
      const next = { ...counts };
      if (res.removed) {
        next[res.type] = Math.max(0, (next[res.type] ?? 0) - 1);
        if (next[res.type] === 0) delete next[res.type];
        onChange?.(next, null);
      } else {
        const prev = myReaction;
        if (prev && prev !== res.type) {
          next[prev] = Math.max(0, (next[prev] ?? 0) - 1);
          if (next[prev] === 0) delete next[prev];
        }
        next[res.type] = (next[res.type] ?? 0) + 1;
        onChange?.(next, res.type);
      }
    } finally {
      setBusy(false);
    }
  };

  const total = Object.values(counts).reduce((s, v) => s + v, 0);

  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {REACTION_TYPES.map((type) => {
          const active = myReaction === type;
          const count = counts[type] ?? 0;
          return (
            <button
              key={type}
              onClick={() => handleReact(type)}
              disabled={busy}
              title={user ? (active ? 'إزالة التفاعل' : REACTION_LABELS[type]) : 'سجّل الدخول للتفاعل'}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-bold transition ${
                active
                  ? 'border-gold-400 bg-gold-100 text-gold-700 shadow-sm'
                  : 'border-stone-200 bg-white text-stone-600 hover:border-brand-300 hover:bg-brand-50'
              }`}
            >
              <span className="text-lg leading-none">{type}</span>
              {count > 0 && <span className="text-xs">{count}</span>}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5 text-sm font-bold text-stone-500">
        <Heart className={`h-4 w-4 ${total > 0 ? 'fill-gold-400 text-gold-500' : 'text-stone-300'}`} />
        {total > 0 ? `${total} تفاعل` : 'كن أول من يتفاعل'}
      </div>
    </div>
  );
}