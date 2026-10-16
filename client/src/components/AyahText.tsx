import { Fragment } from 'react';

/**
 * Split text into plain and Quranic (﴿ … ﴾) runs. `inside` means the text
 * continues an ayah opened earlier (a verse spanning several list points or
 * lines); the returned `inside` says whether an ayah is still open at the end.
 */
export function splitAyah(text: string, inside = false): { parts: { text: string; ayah: boolean }[]; inside: boolean } {
  const parts: { text: string; ayah: boolean }[] = [];
  let i = 0;
  while (i < text.length) {
    if (inside) {
      const close = text.indexOf('﴾', i);
      const end = close === -1 ? text.length : close + 1;
      parts.push({ text: text.slice(i, end), ayah: true });
      i = end;
      inside = close === -1;
    } else {
      const open = text.indexOf('﴿', i);
      const end = open === -1 ? text.length : open;
      if (end > i) parts.push({ text: text.slice(i, end), ayah: false });
      i = end;
      inside = open !== -1;
    }
  }
  return { parts, inside };
}

/** Plain text with any Quranic quotation in ﴿ ﴾ set in the accent colour. */
export default function AyahText({ text, inside = false }: { text: string; inside?: boolean }) {
  return (
    <>
      {splitAyah(text, inside).parts.map((part, i) =>
        part.ayah ? (
          <span key={i} className="ayah">
            {part.text}
          </span>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}
