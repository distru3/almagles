import { REACTIONS, arNumber, useReaction } from './reactions';

interface Props {
  postId: string;
  counts: Record<string, number>;
  myReaction: string | null;
  total?: number;
  onChange?: (counts: Record<string, number>, myReaction: string | null) => void;
}

/** The post page's reaction row: three pill buttons with counts. */
export default function ReactionBar({ postId, counts, myReaction, onChange }: Props) {
  const { normalized, mine, total, react, busy, signedIn } = useReaction(postId, counts, myReaction, onChange);

  return (
    <section aria-label="التفاعل">
      <div className="grid grid-cols-3 gap-2">
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
              title={signedIn ? (active ? `إلغاء ${label}` : label) : 'سجّل الدخول للتفاعل'}
              className={`inline-flex min-h-12 select-none items-center justify-center gap-2 rounded-full border px-3 font-display text-[15px] transition ${
                active
                  ? 'border-accent-fill bg-accent-fill font-semibold text-on-accent'
                  : 'border-line-strong text-fg hover:border-accent hover:text-accent'
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? 'fill-current' : ''}`} aria-hidden="true" />
              <span>{label}</span>
              {count > 0 && (
                <span className={`min-w-6 rounded-full px-1.5 text-sm ${active ? 'bg-on-accent/15' : 'bg-surface-2'}`}>
                  {arNumber.format(count)}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-center text-sm text-muted">
        {total > 0 ? `${arNumber.format(total)} تفاعل` : 'كن أول من يتفاعل'}
      </p>
    </section>
  );
}
