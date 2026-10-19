import type { RefObject } from 'react';
import { AYAH_CLOSE, AYAH_OPEN, HADITH_CLOSE, HADITH_OPEN } from '../lib/richText';

interface Props {
  target: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
}

/**
 * Wraps the selection in a pair of markers (or unwraps it); with nothing
 * selected, inserts the pair and leaves the cursor between them.
 */
function wrap(el: HTMLTextAreaElement, value: string, open: string, close: string) {
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? value.length;
  const selected = value.slice(start, end);
  if (selected.length >= open.length + close.length && selected.startsWith(open) && selected.endsWith(close)) {
    const inner = selected.slice(open.length, -close.length);
    return { next: value.slice(0, start) + inner + value.slice(end), caret: [start, start + inner.length] as const };
  }
  return {
    next: value.slice(0, start) + open + selected + close + value.slice(end),
    caret: [start + open.length, start + open.length + selected.length] as const,
  };
}

function MarkButton({
  target,
  value,
  onChange,
  open,
  close,
  sample,
  sampleClass,
  label,
  ariaLabel,
  title,
}: Props & { open: string; close: string; sample: string; sampleClass: string; label: string; ariaLabel: string; title: string }) {
  const apply = () => {
    const el = target.current;
    if (!el) return;
    const { next, caret } = wrap(el, value, open, close);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret[0], caret[1]);
    });
  };
  return (
    <button
      type="button"
      // Keep focus (and the selection) in the text box, so fields that save on
      // blur don't save half-way through, and the phone keyboard stays open.
      onMouseDown={(e) => e.preventDefault()}
      onClick={apply}
      aria-label={ariaLabel}
      title={title}
      className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-line-strong px-3 font-display text-sm text-fg-2 transition hover:border-accent hover:text-accent"
    >
      <span className={`${sampleClass} text-base`}>{sample}</span>
      {label}
    </button>
  );
}

/** Inserts the Quranic brackets ﴿ ﴾, which no keyboard has a key for. */
export default function AyahButton(props: Props) {
  return (
    <MarkButton
      {...props}
      open={AYAH_OPEN}
      close={AYAH_CLOSE}
      sample="﴿ ﴾"
      sampleClass="ayah"
      label="آية"
      ariaLabel="إدراج آية بين القوسين القرآنيين ﴿ ﴾"
      title="حدّد نص الآية ثم اضغط لوضعها بين ﴿ ﴾ — أو اضغط لإدراج القوسين وكتابة الآية بينهما"
    />
  );
}

/** Marks a hadith with (( )), which the reader shows in its own colour. */
export function HadithButton(props: Props) {
  return (
    <MarkButton
      {...props}
      open={HADITH_OPEN}
      close={HADITH_CLOSE}
      sample="(( ))"
      sampleClass="hadith"
      label="حديث"
      ariaLabel="إدراج حديث بين القوسين المزدوجين (( ))"
      title="حدّد نص الحديث ثم اضغط لوضعه بين (( )) — أو اكتب (( )) بنفسك"
    />
  );
}
