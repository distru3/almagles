import { Fragment } from 'react';

const AYAH = /(﴿[^﴾]*﴾)/g;

/** Plain text with any Quranic quotation in ﴿ ﴾ set in the accent colour. */
export default function AyahText({ text }: { text: string }) {
  return (
    <>
      {text.split(AYAH).map((part, i) =>
        part.startsWith('﴿') && part.endsWith('﴾') ? (
          <span key={i} className="ayah">
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
