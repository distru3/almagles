import { useEffect, useState } from 'react';
import { REACTIONS, ReactionIcons, arNumber, useReaction } from './reactions';
import ReactorsDialog from './ReactorsDialog';

const NO_COUNTS: Record<string, number> = {};

/** The three reactions as small icon pills under a comment or reply. */
export default function CommentReactions({
  commentId,
  counts: initialCounts = NO_COUNTS,
  myReaction: initialMine = null,
}: {
  commentId: string;
  counts?: Record<string, number>;
  myReaction?: string | null;
}) {
  const [counts, setCounts] = useState(initialCounts);
  const [myReaction, setMyReaction] = useState(initialMine);
  const [showReactors, setShowReactors] = useState(false);
  // A fresh comment list from the server replaces what was shown.
  useEffect(() => {
    setCounts(initialCounts);
    setMyReaction(initialMine);
  }, [initialCounts, initialMine]);
  const endpoint = `/comments/${commentId}/reactions`;
  const { normalized, mine, total, react, busy, signedIn } = useReaction(
    endpoint,
    counts,
    myReaction,
    (c, m) => {
      setCounts(c);
      setMyReaction(m);
    },
  );

  return (
    <div className="flex items-center gap-1" role="group" aria-label="التفاعل مع التعليق">
      {REACTIONS.map(({ key, label, icon: Icon }) => {
        const active = mine === key;
        const count = normalized[key] ?? 0;
        return (
          <button
            key={key}
            type="button"
            onClick={() => react(key)}
            disabled={busy}
            aria-pressed={active}
            aria-label={count ? `${label} (${arNumber.format(count)})` : label}
            title={signedIn ? (active ? `إلغاء ${label}` : label) : 'سجّل الدخول للتفاعل'}
            className={`inline-flex min-h-9 min-w-9 select-none items-center justify-center gap-1 rounded-full border px-2.5 text-sm transition ${
              active
                ? 'border-accent-fill bg-accent-fill font-semibold text-on-accent'
                : 'border-transparent text-muted hover:border-line-strong hover:text-accent'
            }`}
          >
            <Icon className={`h-3.5 w-3.5 ${active ? 'fill-current' : ''}`} aria-hidden="true" />
            {count > 0 && <span>{arNumber.format(count)}</span>}
          </button>
        );
      })}
      {total > 0 && (
        <button
          type="button"
          onClick={() => setShowReactors(true)}
          aria-haspopup="dialog"
          aria-label={`عرض من تفاعل (${arNumber.format(total)})`}
          title="من تفاعل؟"
          className="ms-1 inline-flex min-h-9 items-center gap-1 rounded-full border border-line px-2 text-xs text-muted transition hover:border-line-strong hover:text-accent"
        >
          <ReactionIcons counts={normalized} />
          <span>{arNumber.format(total)}</span>
        </button>
      )}
      {showReactors && <ReactorsDialog endpoint={endpoint} onClose={() => setShowReactors(false)} />}
    </div>
  );
}
