import { Check, Plus } from 'lucide-react';

interface DhikrCounterProps {
  id: string;
  count: number;
  maxCount: number;
  countLabel?: string;
  countOptions?: number[];
  selectedTarget?: number;
  onSelectTarget?: (target: number) => void;
  onIncrement: () => void;
}

export default function DhikrCounter({
  count,
  maxCount,
  countLabel,
  countOptions,
  selectedTarget,
  onSelectTarget,
  onIncrement,
}: DhikrCounterProps) {
  const effectiveTarget = selectedTarget ?? maxCount;
  const isFinished = count >= effectiveTarget;
  const progressPercent = Math.min(100, Math.round((count / effectiveTarget) * 100));

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Subtle haptic feedback on mobile if supported
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(22);
      } catch {
        /* ignore */
      }
    }
    onIncrement();
  };

  const currentLabel =
    effectiveTarget === 1
      ? 'مرة واحدة'
      : effectiveTarget === 10
      ? '١٠ مرات'
      : effectiveTarget === 100
      ? '١٠٠ مرة'
      : countLabel || `${effectiveTarget} مرات`;

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {/* Target choice pills if options are available (e.g. 100, 10, 1) */}
      {countOptions && countOptions.length > 1 && onSelectTarget && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-0.5 rounded-full border border-line bg-surface p-0.5 text-[11px] font-bold shadow-2xs"
          title="اختر العدد المستهدف (١٠٠ أو ١٠ أو ١)"
        >
          {countOptions.map((opt) => {
            const isOptSelected = effectiveTarget === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectTarget(opt);
                }}
                className={`rounded-full px-2 py-0.5 font-display transition active:scale-95 ${
                  isOptSelected
                    ? 'bg-accent-fill text-on-accent font-black shadow-xs'
                    : 'text-fg-2 hover:bg-surface-2 hover:text-fg'
                }`}
              >
                {opt === 1 ? '١' : opt === 10 ? '١٠' : '١٠٠'}
              </button>
            );
          })}
        </div>
      )}

      {/* Main Counter Button */}
      {isFinished ? (
        <button
          type="button"
          onClick={handleClick}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-success/40 bg-success-soft px-3.5 py-1.5 font-display text-xs font-black text-success shadow-2xs transition active:scale-95"
          title="اكتمل هذا الذكر — انقر للتكرار الإضافي"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success text-white">
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
          <span>اكتمل ({currentLabel})</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          className={`group relative inline-flex min-h-[40px] items-center justify-center overflow-hidden rounded-full border font-display transition-all duration-150 active:scale-95 ${
            count > 0
              ? 'border-accent bg-surface-2/90 text-fg shadow-sm ring-1 ring-accent/30'
              : 'border-line-strong bg-surface text-fg-2 hover:border-accent hover:bg-surface-2 hover:text-fg shadow-2xs'
          } px-3.5 py-1.5`}
          title="اضغط لاحتساب التكرار"
        >
          {/* Background progress fill for high repetitions */}
          {count > 0 && effectiveTarget > 1 && (
            <span
              className="pointer-events-none absolute inset-y-0 start-0 bg-accent-fill/15 transition-all duration-200"
              style={{ width: `${progressPercent}%` }}
            />
          )}

          <span className="relative z-10 flex items-center gap-2">
            {count > 0 ? (
              <>
                <span className="font-sans text-sm font-black text-accent-strong">
                  {count} <span className="text-muted text-xs font-normal">/ {effectiveTarget}</span>
                </span>
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-fill text-on-accent text-xs font-bold transition group-hover:scale-110">
                  <Plus className="h-3 w-3" strokeWidth={3} />
                </span>
              </>
            ) : (
              <>
                <span className="text-xs font-extrabold">{currentLabel}</span>
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-2 text-accent text-xs transition group-hover:bg-accent-fill group-hover:text-on-accent">
                  <Plus className="h-3 w-3" />
                </span>
              </>
            )}
          </span>
        </button>
      )}
    </div>
  );
}
