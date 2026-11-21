import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { ApiError } from '../../lib/api';
import { BUILT_IN_MARKS, MARK_KINDS, addCustomMark, arNumber, setMark, type QuranIndex, type QuranMark } from '../../lib/quran';
import QuranSheet from './QuranSheet';

/**
 * Tapping an ayah: put «تلاوة» / «حفظ» / «مراجعة» / «تدبّر» here (each
 * moves from wherever it was), or add a mark of your own with a name.
 */
export default function AyahSheet({
  at,
  index,
  marks,
  signedIn,
  onSaved,
  onClose,
}: {
  at: { s: number; a: number };
  index: QuranIndex;
  marks: QuranMark[];
  signedIn: boolean;
  onSaved: (mark: QuranMark) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const sura = index.suras[at.s - 1];

  /** Saves a mark; true when it was saved. */
  const run = async (key: string, action: () => Promise<QuranMark>): Promise<boolean> => {
    setBusy(key);
    setError(null);
    try {
      const mark = await action();
      onSaved(mark);
      setSaved(key);
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر حفظ العلامة');
      return false;
    } finally {
      setBusy(null);
    }
  };

  return (
    <QuranSheet title={`سورة ${sura.name} · الآية ${arNumber(at.a)}`} onClose={onClose}>
      {!signedIn ? (
        <div className="py-3 text-center">
          <p className="text-sm leading-7 text-fg-2">سجّل الدخول لتضع علامة هنا وتجدها على كل أجهزتك.</p>
          <Link to="/login" className="btn-primary mt-3">
            تسجيل الدخول
          </Link>
        </div>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted">ضع علامة على هذه الآية:</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {BUILT_IN_MARKS.map((kind) => {
              const k = MARK_KINDS[kind];
              const Icon = k.icon;
              const current = marks.find((m) => m.kind === kind);
              const here = current?.sura === at.s && current.aya === at.a;
              return (
                <li key={kind}>
                  <button
                    type="button"
                    disabled={here || busy !== null}
                    onClick={() => void run(kind, () => setMark(kind, at.s, at.a))}
                    className={`flex w-full items-center gap-2.5 rounded-sm border px-3 py-2 text-start transition ${
                      here ? 'border-accent/50 bg-accent-soft' : 'border-line hover:border-accent'
                    } disabled:cursor-default`}
                  >
                    <Icon className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-[15px]">{k.name}</span>
                      <span className="block truncate text-[11px] text-muted">
                        {here ? 'العلامة هنا' : current ? `الآن: ${index.suras[current.sura - 1].name} ${arNumber(current.aya)}` : k.hint}
                      </span>
                    </span>
                    {(here || saved === kind) && <Check className="h-4 w-4 shrink-0 text-success" aria-label="وُضعت" />}
                  </button>
                </li>
              );
            })}
          </ul>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (label.trim()) void run('custom', () => addCustomMark(label.trim(), at.s, at.a)).then((ok) => ok && setLabel(''));
            }}
            className="mt-3 border-t border-line pt-3"
          >
            <label htmlFor="custom-mark" className="label !text-xs">
              أو علامة خاصة باسم تختاره
            </label>
            <div className="flex gap-2">
              <input
                id="custom-mark"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={40}
                placeholder="مثل: ورد الفجر"
                className="input !h-10 flex-1"
              />
              <button type="submit" disabled={!label.trim() || busy !== null} className="btn-primary !min-h-10">
                أضف
              </button>
            </div>
            {saved === 'custom' && <p className="mt-1 text-xs text-success">أُضيفت العلامة إلى «علاماتي».</p>}
          </form>
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        </>
      )}
    </QuranSheet>
  );
}
