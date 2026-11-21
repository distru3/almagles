import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { ApiError } from '../../lib/api';
import { BUILT_IN_MARKS, MARK_KINDS, arNumber, deleteMark, renameCustomMark, type QuranIndex, type QuranMark } from '../../lib/quran';
import QuranSheet from './QuranSheet';

type Go = (page: number, at?: { s: number; a: number }) => void;

export function markPlace(index: QuranIndex, m: Pick<QuranMark, 'sura' | 'aya' | 'page'>): string {
  return `${index.suras[m.sura - 1].name} · الآية ${arNumber(m.aya)} · ص ${arNumber(m.page)}`;
}

/** One of the member's own marks: open it, rename it («حفظ» / «تراجع»), or delete it. */
function CustomRow({ mark, index, onGo, onChanged }: { mark: QuranMark; index: QuranIndex; onGo: Go; onChanged: (m: QuranMark | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(mark.label ?? '');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const Icon = MARK_KINDS.custom.icon;

  const save = async () => {
    setError(null);
    try {
      onChanged(await renameCustomMark(mark.id, label));
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر الحفظ');
    }
  };
  const remove = async () => {
    setError(null);
    try {
      await deleteMark(mark.id);
      onChanged(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر الحذف');
    }
  };

  return (
    <li className="py-2.5">
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="flex items-center gap-2"
        >
          <label htmlFor={`mark-${mark.id}`} className="sr-only">
            اسم العلامة
          </label>
          <input id={`mark-${mark.id}`} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} className="input !h-10 flex-1" autoFocus />
          <button type="submit" className="btn-primary !min-h-10 !px-3">
            حفظ
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setLabel(mark.label ?? '');
            }}
            className="btn-outline !min-h-10 !px-3"
          >
            تراجع
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => onGo(mark.page, { s: mark.sura, a: mark.aya })} className="flex min-w-0 flex-1 items-center gap-3 text-start hover:text-accent">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-display text-[15px]">{mark.label}</span>
              <span className="block text-xs text-muted">{markPlace(index, mark)}</span>
            </span>
          </button>
          {confirming ? (
            <span className="flex shrink-0 items-center gap-1 text-xs">
              <button type="button" onClick={() => void remove()} className="rounded-full bg-danger px-2.5 py-1 font-display text-white">
                احذف
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="rounded-full px-2 py-1 text-muted hover:text-fg">
                لا
              </button>
            </span>
          ) : (
            <span className="flex shrink-0 items-center">
              <button type="button" onClick={() => setEditing(true)} aria-label={`تغيير اسم «${mark.label}»`} className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg">
                <Pencil className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setConfirming(true)} aria-label={`حذف «${mark.label}»`} className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-danger">
                <Trash2 className="h-4 w-4" />
              </button>
            </span>
          )}
        </div>
      )}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </li>
  );
}

/** «علاماتي»: the four built-in marks and the member's own, each one tap from its page. */
export default function QuranMarksSheet({
  index,
  marks,
  signedIn,
  onGo,
  onMarks,
  onClose,
}: {
  index: QuranIndex;
  marks: QuranMark[];
  signedIn: boolean;
  onGo: Go;
  onMarks: (marks: QuranMark[]) => void;
  onClose: () => void;
}) {
  if (!signedIn) {
    return (
      <QuranSheet title="علاماتي" onClose={onClose}>
        <p className="py-4 text-center text-sm leading-7 text-fg-2">
          سجّل الدخول لتضع علاماتك — للتلاوة والحفظ والمراجعة والتدبّر — وتجدها على كل أجهزتك.
        </p>
        <div className="pb-2 text-center">
          <Link to="/login" className="btn-primary">
            تسجيل الدخول
          </Link>
        </div>
      </QuranSheet>
    );
  }
  const custom = marks.filter((m) => m.kind === 'custom');
  return (
    <QuranSheet title="علاماتي" onClose={onClose}>
      <ul className="divide-y divide-line">
        {BUILT_IN_MARKS.map((kind) => {
          const k = MARK_KINDS[kind];
          const Icon = k.icon;
          const m = marks.find((x) => x.kind === kind);
          return (
            <li key={kind}>
              <button
                type="button"
                disabled={!m}
                onClick={() => m && onGo(m.page, { s: m.sura, a: m.aya })}
                className="flex w-full items-center gap-3 py-2.5 text-start enabled:hover:text-accent"
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${m ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted'}`}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-[15px]">{k.name}</span>
                  <span className="block text-xs text-muted">{m ? markPlace(index, m) : `${k.hint} — لم تضعها بعد`}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <h3 className="mt-3 border-t border-line pt-3 font-display text-[15px]">علاماتك الخاصة</h3>
      {custom.length === 0 ? (
        <p className="py-2 text-sm text-muted">لا علامات خاصة بعد.</p>
      ) : (
        <ul className="divide-y divide-line">
          {custom.map((m) => (
            <CustomRow
              key={m.id}
              mark={m}
              index={index}
              onGo={onGo}
              onChanged={(next) => onMarks(next ? marks.map((x) => (x.id === m.id ? next : x)) : marks.filter((x) => x.id !== m.id))}
            />
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted">لوضع علامة: اضغط على الآية في الصفحة، ثم اختر نوعها.</p>
    </QuranSheet>
  );
}
