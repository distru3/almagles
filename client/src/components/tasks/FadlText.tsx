import type { Text } from '../../lib/fadail';

/** One ayah or hadith with its source. Ayat are set a little larger, as in a mushaf margin note. */
export default function FadlText({ text, className = '' }: { text: Text; className?: string }) {
  return (
    <figure className={className}>
      <blockquote className={text.kind === 'ayah' ? 'text-[17px] leading-9 text-fg' : 'text-[15px] leading-8 text-fg'}>{text.text}</blockquote>
      <figcaption className="mt-0.5 text-xs text-muted">{text.kind === 'ayah' ? `[${text.source}]` : text.source}</figcaption>
    </figure>
  );
}
