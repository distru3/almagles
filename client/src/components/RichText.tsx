import { Fragment } from 'react';
import { displayUrl, splitRich, type OpenMark } from '../lib/richText';

/**
 * Text with ﴿ verses ﴾ in gold, (( hadith )) in blue and links made clickable.
 * `open` continues a verse/hadith from a previous line (see NoteText).
 * `ugc` marks links as user-submitted (comments) for search engines.
 */
export default function RichText({ text, open = null, ugc = false }: { text: string; open?: OpenMark; ugc?: boolean }) {
  return (
    <>
      {splitRich(text, open).parts.map((part, i) => {
        if (part.kind === 'ayah' || part.kind === 'hadith') {
          return (
            <span key={i} className={part.kind}>
              {part.text}
            </span>
          );
        }
        if (part.kind === 'link') {
          const internal = new URL(part.href!).host === window.location.host;
          return (
            <a
              key={i}
              href={part.href}
              dir="ltr"
              className="rich-link"
              title={part.href}
              {...(internal ? {} : { target: '_blank', rel: `noopener noreferrer${ugc ? ' nofollow ugc' : ''}` })}
            >
              {displayUrl(part.href!)}
            </a>
          );
        }
        return <Fragment key={i}>{part.text}</Fragment>;
      })}
    </>
  );
}
