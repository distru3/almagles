import { useState } from 'react';
import { HandHeart, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { ExcuseReason } from '../../lib/types';
import { addDays, toISODate, todayISO } from '../../lib/dates';
import { EXCUSED } from '../../lib/fadail';
import FadlText from './FadlText';

export const REASON_LABELS: Record<ExcuseReason, string> = { sick: 'مرض', travel: 'سفر', other: 'عذر آخر' };
const DAY_CHOICES = [
  [0, 'اليوم'],
  [-1, 'أمس'],
  [-2, 'قبل يومين'],
] as const;

/**
 * «عندي عذر»: illness, travel or another excuse for today or the last couple
 * of days. It keeps the member's streak and drops those days from «تدارك».
 * «إذا مرض العبد أو سافر كُتب له مثل ما كان يعمل مقيمًا صحيحًا».
 */
export default function ExcuseControl({ excuses, onChange }: { excuses: { day: string; reason: ExcuseReason }[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const day = toISODate(addDays(new Date(), offset));
  const todays = excuses.find((e) => e.day === todayISO());

  const save = async (reason: ExcuseReason | null, forDay = day) => {
    setBusy(true);
    setError(null);
    try {
      await api('/tasks/excuse', { method: 'PUT', body: { date: todayISO(), day: forDay, reason } });
      setOpen(false);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر الحفظ — حاول مرة أخرى');
    } finally {
      setBusy(false);
    }
  };

  if (todays && !open) {
    return (
      <div className="mb-4 rounded-sm border border-line bg-surface px-4 py-3">
        <p className="flex items-center gap-2 font-display text-[15px] text-accent">
          <HandHeart className="h-5 w-5" aria-hidden="true" />
          يومك معذور ({REASON_LABELS[todays.reason]}) — سلسلتك محفوظة
        </p>
        <FadlText text={EXCUSED} className="mt-1.5" />
        <p className="mt-1 text-xs text-muted">
          {todays.reason === 'sick' ? 'شفاك الله وعافاك.' : todays.reason === 'travel' ? 'يسّر الله سفرك وردّك سالمًا.' : 'يسّر الله أمرك.'} وما استطعت من
          المهام فأنجزه، فهو زيادة خير.{' '}
          <button type="button" disabled={busy} onClick={() => void save(null, todays.day)} className="text-accent hover:text-accent-strong">
            إلغاء العذر
          </button>
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <p className="mb-4 text-end text-sm">
        <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-muted hover:text-accent">
          <HandHeart className="h-4 w-4" aria-hidden="true" />
          عندي عذر (مرض أو سفر)
        </button>
      </p>
    );
  }

  return (
    <div className="mb-4 rounded-sm border border-line bg-surface px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <p className="font-display text-[15px]">عذرٌ يحفظ سلسلتك</p>
        <button type="button" onClick={() => setOpen(false)} aria-label="إغلاق" className="-m-1 flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-2">
          <X className="h-4 w-4" />
        </button>
      </div>
      <FadlText text={EXCUSED} className="mt-1" />
      <div className="mt-3 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="اليوم">
        {DAY_CHOICES.map(([n, label]) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={offset === n}
            onClick={() => setOffset(n)}
            className={`min-h-9 rounded-full border px-3 font-display text-sm transition ${offset === n ? 'border-accent bg-accent-soft text-accent' : 'border-line-strong text-fg-2 hover:border-accent'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {(Object.keys(REASON_LABELS) as ExcuseReason[]).map((r) => (
          <button key={r} type="button" disabled={busy} onClick={() => void save(r)} className="btn-outline !min-h-9 !px-4 !text-sm">
            {REASON_LABELS[r]}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <p className="mt-2 text-xs text-muted">لا يمنعك العذر من إنجاز ما تستطيع. وهو لأيام الحاجة — سبعة أيام في الشهر على الأكثر.</p>
    </div>
  );
}
