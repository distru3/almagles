import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { displayUrl, splitRich, type OpenMark } from '../lib/richText';
import { splitMentions } from '../lib/mentions';
import type { Mention } from '../lib/types';

/**
 * Text with ﴿ verses ﴾ in gold, (( hadith )) in blue and links made clickable.
 * `open` continues a verse/hadith from a previous line (see NoteText).
 * `ugc` marks links as user-submitted (comments) for search engines.
 * `mentions`: the members a comment or reply tags; their «@الاسم» links to them.
 */
export default function RichText({ text, open = null, ugc = false, mentions }: { text: string; open?: OpenMark; ugc?: boolean; mentions?: Mention[] }) {
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
        if (!mentions?.length) return <Fragment key={i}>{part.text}</Fragment>;
        return (
          <Fragment key={i}>
            {splitMentions(part.text, mentions).map((m, j) =>
              m.mention ? (
                <Link key={j} to={`/u/${m.mention.id}`} className="font-display text-accent hover:text-accent-strong hover:underline">
                  {m.text}
                </Link>
              ) : (
                <Fragment key={j}>{m.text}</Fragment>
              ),
            )}
          </Fragment>
        );
      })}
    </>
  );
}
