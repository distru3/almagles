import type { RefObject } from 'react';

const OPEN = '﴿';
const CLOSE = '﴾';

/**
 * Inserts the Quranic brackets ﴿ ﴾, which no keyboard has a key for.
 * With text selected it wraps the selection (or unwraps an existing ayah);
 * with nothing selected it inserts the pair and leaves the cursor inside.
 */
export default function AyahButton({
  target,
  value,
  onChange,
}: {
  target: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
}) {
  const apply = () => {
    const el = target.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const selected = value.slice(start, end);

    let next: string;
    let caretStart: number;
    let caretEnd: number;
    if (selected.startsWith(OPEN) && selected.endsWith(CLOSE) && selected.length >= 2) {
      // Already an ayah: remove the brackets.
      const inner = selected.slice(1, -1);
      next = value.slice(0, start) + inner + value.slice(end);
      caretStart = start;
      caretEnd = start + inner.length;
    } else {
      next = value.slice(0, start) + OPEN + selected + CLOSE + value.slice(end);
      // Empty selection: cursor between the brackets, ready to type the verse.
      caretStart = start + 1;
      caretEnd = start + 1 + selected.length;
    }
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caretStart, caretEnd);
    });
  };

  return (
    <button
      type="button"
      // Keep focus (and the selection) in the text box, so fields that save on
      // blur don't save half-way through.
      onMouseDown={(e) => e.preventDefault()}
      onClick={apply}
      aria-label="إدراج آية بين القوسين القرآنيين ﴿ ﴾"
      title="حدّد نص الآية ثم اضغط لوضعها بين ﴿ ﴾ — أو اضغط لإدراج القوسين وكتابة الآية بينهما"
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line-strong px-3 font-display text-sm text-fg-2 transition hover:border-accent hover:text-accent"
    >
      <span className="ayah text-base">﴿ ﴾</span>
      آية
    </button>
  );
}
